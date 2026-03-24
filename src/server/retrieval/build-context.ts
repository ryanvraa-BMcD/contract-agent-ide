import { prisma } from "@/src/lib/prisma";
import {
  rankChunksByLexicalRelevance,
  type ChunkCandidate,
  type RankedChunk,
} from "@/src/server/retrieval/rank-chunks";

export type GroundedAskContext = {
  query: string;
  projectId: string;
  selectedDocumentIds: string[];
  resolvedDocumentIds: string[];
  rankedChunks: RankedChunk[];
};

export type BuildContextInput = {
  projectId: string;
  query: string;
  selectedDocumentIds?: string[];
  maxChunks?: number;
};

function toHeadingPath(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

export async function buildGroundedAskContext(input: BuildContextInput): Promise<GroundedAskContext> {
  const selected = (input.selectedDocumentIds ?? []).filter(Boolean);
  const documents = await prisma.document.findMany({
    where: {
      projectId: input.projectId,
      ...(selected.length > 0 ? { id: { in: selected } } : {}),
      activeVersionId: { not: null },
    },
    select: {
      id: true,
      title: true,
      activeVersionId: true,
    },
  });

  const resolvedDocumentIds = documents.map((document) => document.id);
  const activeVersionIds = documents
    .map((document) => document.activeVersionId)
    .filter((id): id is string => Boolean(id));

  if (activeVersionIds.length === 0) {
    return {
      query: input.query,
      projectId: input.projectId,
      selectedDocumentIds: selected,
      resolvedDocumentIds,
      rankedChunks: [],
    };
  }

  const chunks = await prisma.documentChunk.findMany({
    where: {
      documentVersionId: { in: activeVersionIds },
    },
    select: {
      id: true,
      text: true,
      orderIndex: true,
      headingPath: true,
      documentVersion: {
        select: {
          id: true,
          document: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
  });

  const candidates: ChunkCandidate[] = chunks.map((chunk) => ({
    chunkId: chunk.id,
    documentId: chunk.documentVersion.document.id,
    documentTitle: chunk.documentVersion.document.title,
    versionId: chunk.documentVersion.id,
    text: chunk.text,
    headingPath: toHeadingPath(chunk.headingPath),
    orderIndex: chunk.orderIndex,
  }));

  const rankedChunks = rankChunksByLexicalRelevance({
    query: input.query,
    chunks: candidates,
    limit: input.maxChunks ?? 8,
  });

  return {
    query: input.query,
    projectId: input.projectId,
    selectedDocumentIds: selected,
    resolvedDocumentIds,
    rankedChunks,
  };
}
