import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { storage, storageKeys } from "@/src/lib/storage";
import type { StructuredBlock } from "@/src/types/document";
import type { ProjectStyleSettings } from "@/src/types/style-settings";
import { DEFAULT_STYLE_SETTINGS } from "@/src/types/style-settings";

function parsePtSize(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 11 : n;
}

function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

function ptToTwips(pt: number): number {
  return Math.round(pt * 20);
}

function pxToTwips(px: number): number {
  return Math.round((px / 96) * 1440);
}

function buildDocStyles(ss: ProjectStyleSettings) {
  return {
    default: {
      document: {
        run: {
          font: ss.fontFamily,
          size: ptToHalfPoints(parsePtSize(ss.fontSize)),
        },
        paragraph: {
          spacing: { after: ptToTwips(ss.paragraphSpacingAfter) },
        },
      },
      heading1: {
        run: {
          font: ss.fontFamily,
          size: ptToHalfPoints(parsePtSize(ss.headings.h1.fontSize)),
          bold: ss.headings.h1.bold,
        },
      },
      heading2: {
        run: {
          font: ss.fontFamily,
          size: ptToHalfPoints(parsePtSize(ss.headings.h2.fontSize)),
          bold: ss.headings.h2.bold,
        },
      },
      heading3: {
        run: {
          font: ss.fontFamily,
          size: ptToHalfPoints(parsePtSize(ss.headings.h3.fontSize)),
          bold: ss.headings.h3.bold,
        },
      },
      heading4: {
        run: {
          font: ss.fontFamily,
          size: ptToHalfPoints(parsePtSize(ss.headings.h4.fontSize)),
          bold: ss.headings.h4.bold,
        },
      },
      heading5: {
        run: {
          font: ss.fontFamily,
          size: ptToHalfPoints(parsePtSize(ss.headings.h5.fontSize)),
          bold: ss.headings.h5.bold,
        },
      },
    },
  };
}

function buildSectionProperties(ss: ProjectStyleSettings) {
  return {
    page: {
      margin: {
        top: pxToTwips(ss.pageMargins.top),
        right: pxToTwips(ss.pageMargins.right),
        bottom: pxToTwips(ss.pageMargins.bottom),
        left: pxToTwips(ss.pageMargins.left),
      },
    },
  };
}

type ExportDocxInput = {
  projectId: string;
  documentId: string;
  documentVersionId: string;
  exportJobId: string;
  title: string;
  plainText: string | null;
  structuredJson: unknown;
  styleSettings?: ProjectStyleSettings;
};

type ExportDocxResult = {
  outputStorageKey: string;
  outputSizeBytes: number;
  checksumSha256: string;
  downloadUrl: string;
  exporterMode: "structured_json" | "plain_text";
};

type JsonLike = null | string | number | boolean | JsonLike[] | { [key: string]: JsonLike };

function isJsonObject(value: JsonLike): value is { [key: string]: JsonLike } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStructuredBlocks(structuredJson: unknown): StructuredBlock[] {
  if (!Array.isArray(structuredJson)) return [];
  return structuredJson
    .filter((value): value is { [key: string]: JsonLike } => isJsonObject(value as JsonLike))
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

export type CompileDocumentEntry = {
  title: string;
  role: string;
  plainText: string | null;
  structuredJson: unknown;
};

export type CompileDocxInput = {
  projectId: string;
  projectName: string;
  entries: CompileDocumentEntry[];
  styleSettings?: ProjectStyleSettings;
};

export type CompileDocxResult = {
  outputStorageKey: string;
  outputSizeBytes: number;
  checksumSha256: string;
  downloadUrl: string;
};

export async function compileDocumentsToDocx(input: CompileDocxInput): Promise<CompileDocxResult> {
  const ss = input.styleSettings ?? DEFAULT_STYLE_SETTINGS;
  const sectionProps = buildSectionProperties(ss);

  const sections = input.entries.map((entry) => {
    const blocks = parseStructuredBlocks(entry.structuredJson);
    const bodyParagraphs =
      blocks.length > 0
        ? buildParagraphsFromStructured(blocks)
        : buildParagraphsFromPlainText(entry.plainText);

    return {
      properties: sectionProps,
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: entry.title, bold: true })],
          spacing: { after: 200 },
        }),
        ...bodyParagraphs,
      ],
    };
  });

  const doc = new Document({
    creator: "contract-agent-ide",
    title: `${input.projectName} - Compiled`,
    description: "Compiled contract document",
    styles: buildDocStyles(ss),
    sections,
  });

  const buffer = await Packer.toBuffer(doc);
  const outputStorageKey = storageKeys.compiledArtifact({
    projectId: input.projectId,
    timestamp: Date.now(),
    extension: "docx",
  });

  const stored = await storage.putObject({
    key: outputStorageKey,
    body: buffer,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    metadata: { projectName: input.projectName },
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
  };
}

export async function exportDocumentVersionToDocx(input: ExportDocxInput): Promise<ExportDocxResult> {
  const ss = input.styleSettings ?? DEFAULT_STYLE_SETTINGS;
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
    styles: buildDocStyles(ss),
    sections: [
      {
        properties: buildSectionProperties(ss),
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
