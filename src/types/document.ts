export type HeadingPath = string[];

export type StructuredBlockType =
  | "heading"
  | "paragraph"
  | "list_item"
  | "table_row"
  | "unknown";

export type StructuredBlock = {
  id: string;
  type: StructuredBlockType;
  text: string;
  orderIndex: number;
  headingPath: HeadingPath;
  sourceStart?: number;
  sourceEnd?: number;
  metadata?: Record<string, unknown>;
};

export type ParsedDocument = {
  plainText: string;
  structuredContent: StructuredBlock[];
  metadata?: {
    title?: string;
    wordCount?: number;
    parserVersion?: string;
  };
};

export type LegalChunk = {
  chunkIndex: number;
  orderIndex: number;
  text: string;
  headingPath: HeadingPath;
  sourceStart?: number;
  sourceEnd?: number;
  metadata?: Record<string, unknown>;
};
