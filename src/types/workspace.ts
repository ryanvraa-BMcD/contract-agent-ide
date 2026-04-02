export type UiCitation = {
  documentId: string;
  versionId: string;
  chunkId: string;
  snippet: string;
};

export type WorkspaceDocument = {
  id: string;
  title: string;
  role: "MAIN_AGREEMENT" | "EXHIBIT" | "REFERENCE";
  originalFilename: string;
  originalMimeType: string;
  sizeBytes: number;
  sortOrder: number;
  updatedAt: string;
  activeVersion: {
    versionNumber: number;
  } | null;
  versions: {
    id: string;
    versionNumber: number;
    createdAt: string;
    sourceLabel: string | null;
    createdBy: string | null;
    plainText: string;
    richJson?: unknown;
  }[];
};

export type WorkspaceMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
  citations?: UiCitation[];
};

export function normalizeCitations(value: unknown): UiCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => {
      if (!item || typeof item !== "object") return false;
      const citation = item as Record<string, unknown>;
      return (
        typeof citation.documentId === "string" &&
        typeof citation.versionId === "string" &&
        typeof citation.chunkId === "string" &&
        typeof citation.snippet === "string"
      );
    })
    .map((item) => item as UiCitation);
}
