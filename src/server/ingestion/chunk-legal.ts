import type { LegalChunk, ParsedDocument } from "@/src/types/document";

export type ChunkLegalInput = {
  parsedDocument: ParsedDocument;
  maxCharsPerChunk?: number;
  overlapChars?: number;
};

type ChunkCandidate = {
  text: string;
  headingPath: string[];
  orderIndex: number;
  sourceStart?: number;
  sourceEnd?: number;
  blockCount: number;
};

function splitOversizedCandidate(
  candidate: ChunkCandidate,
  maxCharsPerChunk: number,
  overlapChars: number
): ChunkCandidate[] {
  if (candidate.text.length <= maxCharsPerChunk) {
    return [candidate];
  }

  const segments: ChunkCandidate[] = [];
  const step = Math.max(1, maxCharsPerChunk - Math.max(0, overlapChars));
  let start = 0;
  let segmentOrder = 0;

  while (start < candidate.text.length) {
    const end = Math.min(candidate.text.length, start + maxCharsPerChunk);
    const segmentText = candidate.text.slice(start, end).trim();
    if (segmentText) {
      const baseSourceStart = candidate.sourceStart;
      segments.push({
        text: segmentText,
        headingPath: candidate.headingPath,
        orderIndex: candidate.orderIndex + segmentOrder,
        sourceStart: baseSourceStart !== undefined ? baseSourceStart + start : undefined,
        sourceEnd: baseSourceStart !== undefined ? baseSourceStart + end : undefined,
        blockCount: candidate.blockCount,
      });
      segmentOrder += 1;
    }
    if (end >= candidate.text.length) break;
    start += step;
  }

  return segments;
}

export function chunkLegalContent(input: ChunkLegalInput): LegalChunk[] {
  const maxCharsPerChunk = input.maxCharsPerChunk ?? 1400;
  const overlapChars = input.overlapChars ?? 150;

  if (!input.parsedDocument.structuredContent.length && !input.parsedDocument.plainText.trim()) {
    return [];
  }

  if (input.parsedDocument.structuredContent.length === 0) {
    const fallbackCandidate: ChunkCandidate = {
      text: input.parsedDocument.plainText.trim(),
      headingPath: [],
      orderIndex: 0,
      sourceStart: 0,
      sourceEnd: input.parsedDocument.plainText.length,
      blockCount: 1,
    };

    return splitOversizedCandidate(fallbackCandidate, maxCharsPerChunk, overlapChars).map(
      (candidate, chunkIndex) => ({
        chunkIndex,
        orderIndex: candidate.orderIndex,
        text: candidate.text,
        headingPath: candidate.headingPath,
        sourceStart: candidate.sourceStart,
        sourceEnd: candidate.sourceEnd,
        metadata: { blockCount: candidate.blockCount },
      })
    );
  }

  const candidates: ChunkCandidate[] = [];
  let pendingText = "";
  let pendingHeadingPath: string[] = [];
  let pendingOrderIndex = 0;
  let pendingSourceStart: number | undefined;
  let pendingSourceEnd: number | undefined;
  let pendingBlockCount = 0;

  const flushPending = () => {
    const normalized = pendingText.trim();
    if (!normalized) return;

    candidates.push({
      text: normalized,
      headingPath: pendingHeadingPath,
      orderIndex: pendingOrderIndex,
      sourceStart: pendingSourceStart,
      sourceEnd: pendingSourceEnd,
      blockCount: pendingBlockCount,
    });

    pendingText = "";
    pendingHeadingPath = [];
    pendingOrderIndex = 0;
    pendingSourceStart = undefined;
    pendingSourceEnd = undefined;
    pendingBlockCount = 0;
  };

  for (const block of input.parsedDocument.structuredContent) {
    const text = block.text.trim();
    if (!text) continue;

    const incomingHeadingPath = block.headingPath ?? [];
    const headingChanged =
      pendingBlockCount > 0 &&
      pendingHeadingPath.join(" > ") !== incomingHeadingPath.join(" > ");
    const sizeExceeded =
      pendingBlockCount > 0 && pendingText.length + 2 + text.length > maxCharsPerChunk;
    const blockStartsNewSection = block.type === "heading" && pendingBlockCount > 0;

    if (headingChanged || sizeExceeded || blockStartsNewSection) {
      flushPending();
    }

    if (pendingBlockCount === 0) {
      pendingOrderIndex = block.orderIndex;
      pendingHeadingPath = incomingHeadingPath;
      pendingSourceStart = block.sourceStart;
    }

    pendingText = pendingText ? `${pendingText}\n\n${text}` : text;
    pendingSourceEnd = block.sourceEnd;
    pendingBlockCount += 1;
  }

  flushPending();

  const expanded = candidates.flatMap((candidate) =>
    splitOversizedCandidate(candidate, maxCharsPerChunk, overlapChars)
  );

  return expanded.map((candidate, chunkIndex) => ({
    chunkIndex,
    orderIndex: candidate.orderIndex,
    text: candidate.text,
    headingPath: candidate.headingPath,
    sourceStart: candidate.sourceStart,
    sourceEnd: candidate.sourceEnd,
    metadata: { blockCount: candidate.blockCount },
  }));
}
