export type ChunkCandidate = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  versionId: string;
  text: string;
  headingPath: string[];
  orderIndex: number;
};

export type RankedChunk = ChunkCandidate & {
  score: number;
  matchTerms: string[];
};

export type RankChunksInput = {
  query: string;
  chunks: ChunkCandidate[];
  limit?: number;
};

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "by",
  "at",
  "from",
  "is",
  "are",
  "be",
  "this",
  "that",
]);

function tokenize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function rankChunksByLexicalRelevance(input: RankChunksInput): RankedChunk[] {
  const limit = input.limit ?? 8;
  const queryTerms = tokenize(input.query);
  if (queryTerms.length === 0) {
    return input.chunks.slice(0, limit).map((chunk) => ({
      ...chunk,
      score: 0,
      matchTerms: [],
    }));
  }

  const ranked = input.chunks
    .map((chunk) => {
      const text = chunk.text.toLowerCase();
      const heading = chunk.headingPath.join(" ").toLowerCase();

      let score = 0;
      const matchTerms: string[] = [];
      for (const term of queryTerms) {
        const inText = text.includes(term);
        const inHeading = heading.includes(term);
        if (inText) {
          score += 2;
          matchTerms.push(term);
        }
        if (inHeading) {
          score += 3;
          if (!matchTerms.includes(term)) matchTerms.push(term);
        }
      }

      if (queryTerms.length > 1 && text.includes(queryTerms.join(" "))) {
        score += 4;
      }

      return {
        ...chunk,
        score,
        matchTerms,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.documentId !== b.documentId) return a.documentId.localeCompare(b.documentId);
      return a.orderIndex - b.orderIndex;
    });

  return ranked.slice(0, limit);
}
