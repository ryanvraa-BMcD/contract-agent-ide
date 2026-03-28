import { prisma } from "@/src/lib/prisma";
import type { LegalChunk, ParsedDocument } from "@/src/types/document";
import { chunkLegalContent } from "@/src/server/ingestion/chunk-legal";
import { convertDocToDocxIfNeeded } from "@/src/server/ingestion/convert-doc";
import { parseDocx, type ParseDocxResult } from "@/src/server/ingestion/parse-docx";
import { parsePdf } from "@/src/server/ingestion/parse-pdf";
import { isPdfFile } from "@/src/features/documents/actions";

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

  return filename.replace(/\.(doc|docx|pdf)$/i, "").trim() || "Untitled Document";
}

async function resolveDocumentVersionNumber(documentId: string) {
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });

  return (latest?.versionNumber ?? 0) + 1;
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

async function persistIngestionArtifacts(params: {
  input: IngestDocumentInput;
  sourceLabel: string;
  normalizedMimeType: string;
  storageKey: string | null;
  parsed: ParseDocxResult;
  chunks: LegalChunk[];
}) {
  const { input, sourceLabel, normalizedMimeType, parsed, chunks } = params;

  return prisma.$transaction(async (tx: any) => {
    const document =
      input.documentId
        ? await tx.document.findFirst({
            where: {
              id: input.documentId,
              projectId: input.projectId,
            },
          })
        : null;

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
          normalizedMimeType,
        },
      }));

    const versionNumber = await resolveDocumentVersionNumber(ensuredDocument.id);

    const documentVersion = await tx.documentVersion.create({
      data: {
        documentId: ensuredDocument.id,
        parentVersionId: input.parentVersionId,
        versionNumber,
        storageKey: params.storageKey,
        checksum: input.originalChecksum,
        sizeBytes: input.originalSizeBytes,
        plainText: parsed.plainText,
        structuredJson: toJsonValue(parsed.structuredContent) as any,
        richJson: parsed.richJson ? toJsonValue(parsed.richJson) as any : null,
        contentText: parsed.plainText,
        sourceLabel,
        createdBy: input.createdBy,
      },
    });

    if (chunks.length > 0) {
      await tx.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          documentVersionId: documentVersion.id,
          chunkIndex: chunk.chunkIndex,
          orderIndex: chunk.orderIndex,
          headingPath: toJsonValue(chunk.headingPath) as any,
          sourceStart: chunk.sourceStart,
          sourceEnd: chunk.sourceEnd,
          text: chunk.text,
          metadataJson:
            chunk.metadata === undefined ? undefined : (toJsonValue(chunk.metadata) as any),
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
  if (isPdfFile(input.originalFilename, input.originalMimeType)) {
    const parsed = await parsePdf({
      filename: input.originalFilename,
      fileBuffer: input.fileBuffer,
    });

    const chunks = chunkLegalContent({ parsedDocument: parsed });

    const persisted = await persistIngestionArtifacts({
      input,
      sourceLabel: "uploaded-pdf",
      normalizedMimeType: "application/pdf",
      storageKey: input.originalStorageKey,
      parsed,
      chunks,
    });

    return {
      documentId: persisted.documentId,
      documentVersionId: persisted.documentVersionId,
      chunkCount: chunks.length,
      wasConverted: false,
    };
  }

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

  const chunks = chunkLegalContent({ parsedDocument: parsed });

  const persisted = await persistIngestionArtifacts({
    input,
    sourceLabel: normalizedDocx.wasConverted ? "converted-docx" : "uploaded-docx",
    normalizedMimeType: normalizedDocx.mimeType,
    storageKey: normalizedDocx.wasConverted ? null : input.originalStorageKey,
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
