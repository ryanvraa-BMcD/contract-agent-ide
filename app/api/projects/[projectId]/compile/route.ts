import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { compileDocumentsToDocx } from "@/src/server/export/export-docx";
import { parseStyleSettings } from "@/src/types/style-settings";
import { notFound, badRequest, serverError, parseJsonBody } from "@/src/lib/api-helpers";
import { compileRequestSchema } from "@/src/lib/validation";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  const result = await parseJsonBody(request, compileRequestSchema);
  if (result.error) return result.error;
  const { documentIds } = result.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, styleSettings: true },
  });
  if (!project) return notFound("Project");

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
    return badRequest("No compilable documents found (documents need an active version).");
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
    return serverError(error instanceof Error ? error.message : "Compilation failed.");
  }
}
