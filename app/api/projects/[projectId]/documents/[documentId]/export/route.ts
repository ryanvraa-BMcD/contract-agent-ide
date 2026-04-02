import { ExportJobStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { exportDocumentVersionToDocx } from "@/src/server/export/export-docx";
import { parseStyleSettings } from "@/src/types/style-settings";

type RouteContext = {
  params: Promise<{
    projectId: string;
    documentId: string;
  }>;
};

type ExportRequestBody = {
  documentVersionId: string;
  requestedBy?: string;
};

function parseExportRequestBody(body: unknown): ExportRequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object.");
  }
  const payload = body as Record<string, unknown>;
  if (typeof payload.documentVersionId !== "string" || payload.documentVersionId.trim().length === 0) {
    throw new Error("documentVersionId is required.");
  }
  return {
    documentVersionId: payload.documentVersionId.trim(),
    requestedBy: typeof payload.requestedBy === "string" ? payload.requestedBy : undefined,
  };
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId, documentId } = await context.params;

  let payload: ExportRequestBody;
  try {
    payload = parseExportRequestBody(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request payload." },
      { status: 400 }
    );
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      projectId,
    },
    select: {
      id: true,
      title: true,
    },
  });
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const version = await prisma.documentVersion.findFirst({
    where: {
      id: payload.documentVersionId,
      documentId,
    },
    select: {
      id: true,
      plainText: true,
      structuredJson: true,
    },
  });
  if (!version) {
    return NextResponse.json({ error: "Requested document version not found." }, { status: 404 });
  }

  const job = await prisma.exportJob.create({
    data: {
      projectId,
      documentId,
      documentVersionId: version.id,
      requestedBy: payload.requestedBy,
      format: "DOCX",
      status: ExportJobStatus.PENDING,
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  try {
    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: ExportJobStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { styleSettings: true },
    });

    const exported = await exportDocumentVersionToDocx({
      projectId,
      documentId,
      documentVersionId: version.id,
      exportJobId: job.id,
      title: document.title,
      plainText: version.plainText,
      structuredJson: version.structuredJson,
      styleSettings: parseStyleSettings(project?.styleSettings),
    });

    const completed = await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: ExportJobStatus.COMPLETED,
        outputStorageKey: exported.outputStorageKey,
        error: null,
        completedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        outputStorageKey: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({
      jobId: completed.id,
      status: completed.status.toLowerCase(),
      documentVersionId: version.id,
      outputStorageKey: completed.outputStorageKey,
      downloadUrl: exported.downloadUrl,
      exporterMode: exported.exporterMode,
      outputSizeBytes: exported.outputSizeBytes,
      checksumSha256: exported.checksumSha256,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    const failed = await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: ExportJobStatus.FAILED,
        error: message,
        completedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        error: true,
      },
    });

    return NextResponse.json(
      {
        jobId: failed.id,
        status: failed.status.toLowerCase(),
        error: failed.error,
      },
      { status: 500 }
    );
  }
}
