import type { ParsedDocument } from "@/src/types/document";

export type ParseDocxInput = {
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
};

export async function parseDocx(input: ParseDocxInput): Promise<ParsedDocument> {
  // TODO: Parse DOCX XML into a structured block model (headings/paragraphs/tables).
  // TODO: Extract plain text suitable for retrieval and diffing.
  // TODO: Capture source offsets when available for precise edit targeting.
  // TODO: Preserve parser diagnostics in metadata for troubleshooting.

  if (!input.filename.toLowerCase().endsWith(".docx")) {
    throw new Error("parseDocx expected a .docx file.");
  }

  return {
    plainText: "",
    structuredContent: [],
    metadata: {
      parserVersion: "stub-v1",
    },
  };
}
