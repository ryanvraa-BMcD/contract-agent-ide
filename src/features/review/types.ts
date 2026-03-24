export type ReviewCitation = {
  documentId: string;
  versionId: string;
  chunkId: string;
  snippet: string;
};

export type ReviewOperation = {
  opType: "replace_text" | "insert_before" | "insert_after";
  target: {
    documentId: string;
    versionId: string;
    chunkId: string;
    headingPath?: string[];
  };
  findText?: string;
  replaceText?: string;
  insertText?: string;
};

export type ReviewProposal = {
  title: string;
  rationale: string;
  citations: ReviewCitation[];
  operations: ReviewOperation[];
};
