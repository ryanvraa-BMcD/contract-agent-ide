import { NextResponse } from "next/server";
import { prisma, type TransactionClient } from "@/src/lib/prisma";
import { storage } from "@/src/lib/storage";
import { parseDocx } from "@/src/server/ingestion/parse-docx";
import { chunkLegalContent } from "@/src/server/ingestion/chunk-legal";
import { notFound, badRequest, serverError } from "@/src/lib/api-helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; documentId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { projectId, documentId } = await context.params;

  const document = await prisma.document.findFirst({
    where: { id: documentId, projectId },
    select: {
      id: true,
      originalStorageKey: true,
      originalFilename: true,
      originalMimeType: true,
      activeVersionId: true,
    },
  });

  if (!document) return notFound("Document");

  if (!document.activeVersionId) {
    return badRequest("No active version.");
  }

  try {
    const obj = await storage.getObject({ key: document.originalStorageKey });

    const parsed = await parseDocx({
      filename: document.originalFilename,
      mimeType: document.originalMimeType,
      fileBuffer: obj.body,
    });

    const chunks = chunkLegalContent({ parsedDocument: parsed });

    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.documentVersion.update({
        where: { id: document.activeVersionId },
        data: {
          plainText: parsed.plainText,
          structuredJson: JSON.parse(JSON.stringify(parsed.structuredContent)),
          richJson: JSON.parse(JSON.stringify(parsed.richJson)),
          contentText: parsed.plainText,
        },
      });

      await tx.documentChunk.deleteMany({
        where: { documentVersionId: document.activeVersionId },
      });

      if (chunks.length > 0) {
        await tx.documentChunk.createMany({
          data: chunks.map((chunk) => ({
            documentVersionId: document.activeVersionId,
            chunkIndex: chunk.chunkIndex,
            orderIndex: chunk.orderIndex,
            headingPath: JSON.parse(JSON.stringify(chunk.headingPath)),
            sourceStart: chunk.sourceStart,
            sourceEnd: chunk.sourceEnd,
            text: chunk.text,
            metadataJson: chunk.metadata
              ? JSON.parse(JSON.stringify(chunk.metadata))
              : undefined,
          })),
        });
      }
    });

    return NextResponse.json({
      ok: true,
      wordCount: parsed.metadata?.wordCount,
      parserVersion: parsed.metadata?.parserVersion,
    });
  } catch (err) {
    console.error("Re-ingest failed:", err);
    return serverError("Failed to re-ingest document.");
  }
}
