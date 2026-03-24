import { prisma } from "@/src/lib/prisma";
import { createDocumentSchema } from "@/src/lib/validation";

export function isDocxFile(filename: string, mimeType: string) {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export async function listProjectDocuments(projectId: string) {
  return prisma.document.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: { activeVersion: true },
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
