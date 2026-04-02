import { prisma } from "@/src/lib/prisma";
import { storage } from "@/src/lib/storage";
import { notFound, serverError } from "@/src/lib/api-helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId, documentId } = await context.params;

  const document = await prisma.document.findFirst({
    where: { id: documentId, projectId },
    select: { originalStorageKey: true, originalMimeType: true },
  });

  if (!document) return notFound("Document");

  try {
    const obj = await storage.getObject({ key: document.originalStorageKey });
    return new Response(new Uint8Array(obj.body), {
      headers: {
        "Content-Type":
          document.originalMimeType ||
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Length": String(obj.sizeBytes),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return serverError("Failed to read document file.");
  }
}
