import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import type { LegalChunk, ParsedDocument } from "@/src/types/document";
import { chunkLegalContent } from "@/src/server/ingestion/chunk-legal";
import { convertDocToDocxIfNeeded } from "@/src/server/ingestion/convert-doc";
import { parseDocx } from "@/src/server/ingestion/parse-docx";

export type IngestDocumentInput = {
  projectId: string;
  documentId?: string;
  title?: string;
  originalFilename: string;
  originalMimeType: string;
  originalSizeBytes: number;
  originalStorageKey: string;
  originalChecksum?: string;
  fileBuffer: Buffer;
  parentVersionId?: string;
  createdBy?: string;
};

export type IngestDocumentResult = {
  documentId: string;
  documentVersionId: string;
  chunkCount: number;
  wasConverted: boolean;
};

function deriveDocumentTitle(filename: string, explicitTitle?: string) {
  if (explicitTitle?.trim()) {
    return explicitTitle.trim();
  }

  return filename.replace(/\.(doc|docx)$/i, "").trim() || "Untitled Document";
}

async function resolveDocumentVersionNumber(documentId: string) {
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });

  return (latest?.versionNumber ?? 0) + 1;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function persistIngestionArtifacts(params: {
  input: IngestDocumentInput;
  normalizedDocx: {
    filename: string;
    mimeType: string;
    wasConverted: boolean;
  };
  parsed: ParsedDocument;
  chunks: LegalChunk[];
}) {
  const { input, normalizedDocx, parsed, chunks } = params;

  return prisma.$transaction(async (tx) => {
    const document =
      input.documentId
        ? await tx.document.findFirst({
            where: {
              id: input.documentId,
              projectId: input.projectId,
            },
          })
        : null;

    // TODO: Add guardrails for immutable source metadata on re-ingestion paths.
    const ensuredDocument =
      document ??
      (await tx.document.create({
        data: {
          projectId: input.projectId,
          title: deriveDocumentTitle(input.originalFilename, input.title),
          originalFilename: input.originalFilename,
          originalMimeType: input.originalMimeType,
          originalSizeBytes: input.originalSizeBytes,
          originalStorageKey: input.originalStorageKey,
          originalChecksum: input.originalChecksum,
          normalizedMimeType: normalizedDocx.mimeType,
        },
      }));

    const versionNumber = await resolveDocumentVersionNumber(ensuredDocument.id);

    const documentVersion = await tx.documentVersion.create({
      data: {
        documentId: ensuredDocument.id,
        parentVersionId: input.parentVersionId,
        versionNumber,
        plainText: parsed.plainText,
        structuredJson: toInputJsonValue(parsed.structuredContent),
        contentText: parsed.plainText,
        sourceLabel: normalizedDocx.wasConverted ? "converted-docx" : "uploaded-docx",
        createdBy: input.createdBy,
      },
    });

    if (chunks.length > 0) {
      await tx.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          documentVersionId: documentVersion.id,
          chunkIndex: chunk.chunkIndex,
          orderIndex: chunk.orderIndex,
          headingPath: toInputJsonValue(chunk.headingPath),
          sourceStart: chunk.sourceStart,
          sourceEnd: chunk.sourceEnd,
          text: chunk.text,
          metadataJson:
            chunk.metadata === undefined ? undefined : toInputJsonValue(chunk.metadata),
        })),
      });
    }

    await tx.document.update({
      where: { id: ensuredDocument.id },
      data: {
        activeVersionId: documentVersion.id,
      },
    });

    return {
      documentId: ensuredDocument.id,
      documentVersionId: documentVersion.id,
    };
  });
}

export async function ingestDocument(input: IngestDocumentInput): Promise<IngestDocumentResult> {
  // TODO: Persist and reference normalized DOCX storage key after conversion pipeline is implemented.
  const normalizedDocx = await convertDocToDocxIfNeeded({
    filename: input.originalFilename,
    mimeType: input.originalMimeType,
    fileBuffer: input.fileBuffer,
  });

  const parsed = await parseDocx({
    filename: normalizedDocx.filename,
    mimeType: normalizedDocx.mimeType,
    fileBuffer: normalizedDocx.fileBuffer,
  });

  const chunks = chunkLegalContent({
    parsedDocument: parsed,
  });

  const persisted = await persistIngestionArtifacts({
    input,
    normalizedDocx: {
      filename: normalizedDocx.filename,
      mimeType: normalizedDocx.mimeType,
      wasConverted: normalizedDocx.wasConverted,
    },
    parsed,
    chunks,
  });

  return {
    documentId: persisted.documentId,
    documentVersionId: persisted.documentVersionId,
    chunkCount: chunks.length,
    wasConverted: normalizedDocx.wasConverted,
  };
}
