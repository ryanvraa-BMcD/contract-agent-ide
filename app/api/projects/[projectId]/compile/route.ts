import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { compileDocumentsToDocx } from "@/src/server/export/export-docx";
import { parseStyleSettings } from "@/src/types/style-settings";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

function parseBody(body: unknown): string[] {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object.");
  }
  const payload = body as Record<string, unknown>;
  if (!Array.isArray(payload.documentIds)) {
    throw new Error("documentIds must be an array of strings.");
  }
  const ids = payload.documentIds.filter(
    (id: unknown): id is string => typeof id === "string" && id.trim().length > 0,
  );
  if (ids.length === 0) {
    throw new Error("At least one documentId is required.");
  }
  return ids;
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  let documentIds: string[];
  try {
    documentIds = parseBody(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request payload." },
      { status: 400 },
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, styleSettings: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const documents = await prisma.document.findMany({
    where: { id: { in: documentIds }, projectId },
    include: {
      activeVersion: {
        select: {
          id: true,
          plainText: true,
          structuredJson: true,
        },
      },
    },
  });

  const docMap = new Map(documents.map((d) => [d.id, d]));
  const orderedDocs = documentIds
    .map((id) => docMap.get(id))
    .filter((d): d is NonNullable<typeof d> => d != null && d.activeVersion != null);

  if (orderedDocs.length === 0) {
    return NextResponse.json(
      { error: "No compilable documents found (documents need an active version)." },
      { status: 400 },
    );
  }

  try {
    const result = await compileDocumentsToDocx({
      projectId,
      projectName: project.name,
      entries: orderedDocs.map((doc) => ({
        title: doc.title,
        role: doc.role,
        plainText: doc.activeVersion!.plainText,
        structuredJson: doc.activeVersion!.structuredJson,
      })),
      styleSettings: parseStyleSettings(project.styleSettings),
    });

    return NextResponse.json({
      downloadUrl: result.downloadUrl,
      outputStorageKey: result.outputStorageKey,
      outputSizeBytes: result.outputSizeBytes,
      checksumSha256: result.checksumSha256,
      documentCount: orderedDocs.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Compilation failed." },
      { status: 500 },
    );
  }
}
