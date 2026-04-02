import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { storage } from "@/src/lib/storage";
import { extractDocxStyles } from "@/src/server/ingestion/extract-docx-styles";
import { notFound, badRequest, serverError } from "@/src/lib/api-helpers";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  if (!body || typeof body !== "object") {
    return badRequest("Request body must be an object.");
  }

  const payload = body as Record<string, unknown>;
  const documentId = payload.documentId;
  if (typeof documentId !== "string" || !documentId.trim()) {
    return badRequest("documentId is required.");
  }

  const document = await prisma.document.findFirst({
    where: { id: documentId.trim(), projectId },
    select: {
      id: true,
      originalStorageKey: true,
      originalMimeType: true,
      title: true,
    },
  });

  if (!document) return notFound("Document");

  const isDocx =
    document.originalMimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    document.originalStorageKey.toLowerCase().endsWith(".docx");

  if (!isDocx) {
    return badRequest("Style extraction is only supported for .docx files.");
  }

  try {
    const fileData = await storage.getObject({ key: document.originalStorageKey });
    const settings = await extractDocxStyles(fileData.body);

    return NextResponse.json({
      styleSettings: settings,
      sourceDocument: { id: document.id, title: document.title },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extract styles.";
    return serverError(message);
  }
}
