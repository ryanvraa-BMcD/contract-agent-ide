import { NextResponse } from "next/server";
import { DocumentRole } from "@prisma/client";
import {
  isSupportedContractFile,
  isPdfFile,
  upsertDocumentFromUpload,
} from "@/src/features/documents/actions";
import { storage, storageKeys } from "@/src/lib/storage";
import { ingestDocument } from "@/src/server/ingestion/ingest-document";

const VALID_ROLES = new Set<string>(Object.values(DocumentRole));

export const runtime = "nodejs";

type UploadRouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: Request, context: UploadRouteContext) {
  const { projectId } = await context.params;
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (!isSupportedContractFile(file.name, file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Only .doc, .docx, and .pdf files are accepted." },
      { status: 400 }
    );
  }

  const rawRole = formData.get("role");
  const defaultRole = isPdfFile(file.name, file.type)
    ? DocumentRole.REFERENCE
    : DocumentRole.MAIN_AGREEMENT;
  const role: DocumentRole =
    typeof rawRole === "string" && VALID_ROLES.has(rawRole)
      ? (rawRole as DocumentRole)
      : defaultRole;

  const storageKey = storageKeys.originalUpload(projectId, file.name);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const normalizedMimeType =
    file.type ||
    (file.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : file.name.toLowerCase().endsWith(".doc")
        ? "application/msword"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  const storedObject = await storage.putObject({
    key: storageKey,
    body: fileBuffer,
    contentType: normalizedMimeType,
  });

  const title = file.name.replace(/\.(doc|docx|pdf)$/i, "");

  const document = await upsertDocumentFromUpload({
    projectId,
    title,
    sourceFileName: file.name,
    sourceMimeType: normalizedMimeType,
    sourceSizeBytes: file.size,
    originalStorageKey: storageKey,
    checksum: storedObject.checksumSha256,
    role,
  });

  // TODO: Add persistent ingestion status field on Document once schema adds it.
  let ingestionStatus: "completed" | "failed" = "completed";
  let ingestionError: string | undefined;
  let documentVersionId: string | undefined;

  try {
    const result = await ingestDocument({
      projectId,
      documentId: document.id,
      title,
      originalFilename: file.name,
      originalMimeType: normalizedMimeType,
      originalSizeBytes: file.size,
      originalStorageKey: storageKey,
      originalChecksum: storedObject.checksumSha256,
      fileBuffer,
    });
    documentVersionId = result.documentVersionId;
  } catch (error) {
    ingestionStatus = "failed";
    ingestionError = error instanceof Error ? error.message : "Ingestion failed.";
  }

  const httpStatus = ingestionStatus === "completed" ? 200 : 202;
  return NextResponse.json({
    documentId: document.id,
    documentVersionId,
    uploadStatus: "stored",
    ingestionStatus,
    ingestionError,
  }, { status: httpStatus });
}
