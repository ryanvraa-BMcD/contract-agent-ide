import { prisma } from "@/src/lib/prisma";
import { createDocumentSchema } from "@/src/lib/validation";

const DOC_MIME_TYPE = "application/msword";
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function isSupportedContractFile(filename: string, mimeType: string) {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith(".docx") ||
    lower.endsWith(".doc") ||
    mimeType === DOCX_MIME_TYPE ||
    mimeType === DOC_MIME_TYPE
  );
}

export function isDocxFile(filename: string, mimeType: string) {
  const lower = filename.toLowerCase();
  return lower.endsWith(".docx") || mimeType === DOCX_MIME_TYPE;
}

export async function listProjectDocuments(projectId: string) {
  return prisma.document.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: { activeVersion: true },
  });
}

type UpsertDocumentFromUploadInput = {
  projectId: string;
  title: string;
  sourceFileName: string;
  sourceMimeType: string;
  sourceSizeBytes: number;
  originalStorageKey: string;
  checksum?: string;
};

export async function upsertDocumentFromUpload(input: UpsertDocumentFromUploadInput) {
  const existing = await prisma.document.findFirst({
    where: {
      projectId: input.projectId,
      originalFilename: input.sourceFileName,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return prisma.document.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        originalFilename: input.sourceFileName,
        originalMimeType: input.sourceMimeType,
        originalSizeBytes: input.sourceSizeBytes,
        originalStorageKey: input.originalStorageKey,
        originalChecksum: input.checksum,
      },
    });
  }

  return prisma.document.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      originalFilename: input.sourceFileName,
      originalMimeType: input.sourceMimeType,
      originalSizeBytes: input.sourceSizeBytes,
      originalStorageKey: input.originalStorageKey,
      originalChecksum: input.checksum,
    },
  });
}

type CreateDocumentInput = {
  projectId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  checksum?: string;
};

export async function createDocumentMetadata(input: CreateDocumentInput) {
  const parsed = createDocumentSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        projectId: parsed.projectId,
        title: parsed.title,
        originalFilename: parsed.originalFilename,
        originalMimeType: parsed.mimeType,
        originalSizeBytes: parsed.sizeBytes,
        originalStorageKey: parsed.storageKey,
        originalChecksum: parsed.checksum,
      },
    });

    const version = await tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        sizeBytes: parsed.sizeBytes,
        storageKey: parsed.storageKey,
        checksum: parsed.checksum,
      },
    });

    const updatedDocument = await tx.document.update({
      where: { id: document.id },
      data: { activeVersionId: version.id },
      include: { activeVersion: true },
    });

    return { document: updatedDocument, version };
  });
}
