import { NextResponse } from "next/server";
import { createDocumentMetadata, isDocxFile } from "@/src/features/documents/actions";
import { storage, storageKeys } from "@/src/lib/storage";

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

  if (!isDocxFile(file.name, file.type)) {
    return NextResponse.json({ error: "Only .docx files are accepted." }, { status: 400 });
  }

  const storageKey = storageKeys.originalUpload(projectId, file.name);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storedObject = await storage.putObject({
    key: storageKey,
    body: fileBuffer,
    contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const title = file.name.replace(/\.docx$/i, "");

  const created = await createDocumentMetadata({
    projectId,
    title,
    originalFilename: file.name,
    mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: file.size,
    storageKey,
    checksum: storedObject.checksumSha256,
  });

  return NextResponse.json({
    documentId: created.document.id,
    documentVersionId: created.version.id,
    message: "File stored via local storage provider and metadata recorded.",
  });
}
