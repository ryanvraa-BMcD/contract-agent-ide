import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { storage } from "@/src/lib/storage";
import { extractDocxStyles } from "@/src/server/ingestion/extract-docx-styles";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const documentId = payload.documentId;
  if (typeof documentId !== "string" || !documentId.trim()) {
    return NextResponse.json({ error: "documentId is required." }, { status: 400 });
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

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const isDocx =
    document.originalMimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    document.originalStorageKey.toLowerCase().endsWith(".docx");

  if (!isDocx) {
    return NextResponse.json(
      { error: "Style extraction is only supported for .docx files." },
      { status: 400 },
    );
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
