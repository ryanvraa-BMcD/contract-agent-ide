import type { LegalChunk, ParsedDocument } from "@/src/types/document";

export type ChunkLegalInput = {
  parsedDocument: ParsedDocument;
  maxCharsPerChunk?: number;
  overlapChars?: number;
};

export function chunkLegalContent(input: ChunkLegalInput): LegalChunk[] {
  // TODO: Implement legal-aware chunking:
  // 1) prefer heading/clause boundaries
  // 2) fallback to size-based chunk windows with overlap
  // 3) preserve headingPath + source range on every chunk
  // 4) support table/list section handling
  // 5) tune chunk sizing for retrieval quality

  if (!input.parsedDocument.structuredContent.length && !input.parsedDocument.plainText.trim()) {
    return [];
  }

  // Minimal placeholder chunk to keep ingestion pipeline shape intact.
  const text = input.parsedDocument.plainText.trim();
  return [
    {
      chunkIndex: 0,
      orderIndex: 0,
      text,
      headingPath: [],
    },
  ];
}
