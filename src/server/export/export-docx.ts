import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { Prisma } from "@prisma/client";
import { storage, storageKeys } from "@/src/lib/storage";
import type { StructuredBlock } from "@/src/types/document";

type ExportDocxInput = {
  projectId: string;
  documentId: string;
  documentVersionId: string;
  exportJobId: string;
  title: string;
  plainText: string | null;
  structuredJson: Prisma.JsonValue | null;
};

type ExportDocxResult = {
  outputStorageKey: string;
  outputSizeBytes: number;
  checksumSha256: string;
  downloadUrl: string;
  exporterMode: "structured_json" | "plain_text";
};

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStructuredBlocks(structuredJson: Prisma.JsonValue | null): StructuredBlock[] {
  if (!Array.isArray(structuredJson)) return [];
  return structuredJson
    .filter((value): value is Prisma.JsonObject => isJsonObject(value))
    .map((value, index) => {
      const type = typeof value["type"] === "string" ? value["type"] : "paragraph";
      const text = typeof value["text"] === "string" ? value["text"] : "";
      const rawHeadingPath = value["headingPath"];
      const headingPath = Array.isArray(rawHeadingPath)
        ? rawHeadingPath.filter((part): part is string => typeof part === "string")
        : [];

      return {
        id: typeof value["id"] === "string" ? value["id"] : `block-${index}`,
        type: (["heading", "paragraph", "list_item", "table_row", "unknown"].includes(type)
          ? type
          : "unknown") as StructuredBlock["type"],
        text,
        orderIndex: typeof value["orderIndex"] === "number" ? value["orderIndex"] : index,
        headingPath,
        sourceStart: typeof value["sourceStart"] === "number" ? value["sourceStart"] : undefined,
        sourceEnd: typeof value["sourceEnd"] === "number" ? value["sourceEnd"] : undefined,
      };
    })
    .filter((block) => block.text.trim().length > 0);
}

function buildParagraphsFromStructured(blocks: StructuredBlock[]) {
  return blocks.map((block) => {
    const clean = block.text.replace(/\r/g, "").trim();
    if (block.type === "heading") {
      const depth = Math.min(5, Math.max(1, block.headingPath.length || 1));
      const heading =
        depth === 1
          ? HeadingLevel.HEADING_1
          : depth === 2
          ? HeadingLevel.HEADING_2
          : depth === 3
          ? HeadingLevel.HEADING_3
          : depth === 4
          ? HeadingLevel.HEADING_4
          : HeadingLevel.HEADING_5;
      return new Paragraph({
        heading,
        children: [new TextRun(clean)],
      });
    }
    return new Paragraph({
      children: [new TextRun(clean)],
    });
  });
}

function buildParagraphsFromPlainText(plainText: string | null) {
  const text = (plainText || "").trim();
  if (!text) {
    return [new Paragraph("No content available in this document version.")];
  }
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => new Paragraph(paragraph));
}

export async function exportDocumentVersionToDocx(input: ExportDocxInput): Promise<ExportDocxResult> {
  const structuredBlocks = parseStructuredBlocks(input.structuredJson);
  const exporterMode = structuredBlocks.length > 0 ? "structured_json" : "plain_text";
  const bodyParagraphs =
    exporterMode === "structured_json"
      ? buildParagraphsFromStructured(structuredBlocks)
      : buildParagraphsFromPlainText(input.plainText);

  const document = new Document({
    creator: "contract-agent-ide",
    title: `${input.title} - Export`,
    description: "MVP exported document version",
    sections: [
      {
        children: bodyParagraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  const outputStorageKey = storageKeys.exportArtifact({
    projectId: input.projectId,
    documentId: input.documentId,
    exportJobId: input.exportJobId,
    extension: "docx",
  });

  const stored = await storage.putObject({
    key: outputStorageKey,
    body: buffer,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    metadata: {
      documentVersionId: input.documentVersionId,
      exporterMode,
    },
  });

  const downloadUrl = await storage.getSignedDownloadUrl({
    key: outputStorageKey,
    expiresInSeconds: 3600,
  });

  return {
    outputStorageKey,
    outputSizeBytes: stored.sizeBytes,
    checksumSha256: stored.checksumSha256,
    downloadUrl,
    exporterMode,
  };
}
