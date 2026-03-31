import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock external dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    documentVersion: {
      findFirst: vi.fn(),
    },
    document: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    documentChunk: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) =>
      cb({
        document: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "doc-1" }),
          update: vi.fn().mockResolvedValue({ id: "doc-1" }),
        },
        documentVersion: {
          create: vi.fn().mockResolvedValue({ id: "ver-1" }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        documentChunk: {
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      })
    ),
  },
}));

vi.mock("@/src/server/ingestion/parse-pdf", () => ({
  parsePdf: vi.fn(),
}));

vi.mock("@/src/server/ingestion/parse-docx", () => ({
  parseDocx: vi.fn(),
}));

vi.mock("@/src/server/ingestion/convert-doc", () => ({
  convertDocToDocxIfNeeded: vi.fn(),
}));

vi.mock("@/src/server/ingestion/chunk-legal", () => ({
  chunkLegalContent: vi.fn(),
}));

vi.mock("@/src/features/documents/actions", () => ({
  isPdfFile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import module under test and mocked helpers after vi.mock() calls
// ---------------------------------------------------------------------------

import { ingestDocument } from "@/src/server/ingestion/ingest-document";
import { parsePdf } from "@/src/server/ingestion/parse-pdf";
import { parseDocx } from "@/src/server/ingestion/parse-docx";
import { convertDocToDocxIfNeeded } from "@/src/server/ingestion/convert-doc";
import { chunkLegalContent } from "@/src/server/ingestion/chunk-legal";
import { isPdfFile } from "@/src/features/documents/actions";

const mockParsePdf = vi.mocked(parsePdf);
const mockParseDocx = vi.mocked(parseDocx);
const mockConvertDoc = vi.mocked(convertDocToDocxIfNeeded);
const mockChunkLegal = vi.mocked(chunkLegalContent);
const mockIsPdfFile = vi.mocked(isPdfFile);

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const FAKE_PLAIN_TEXT = "EXHIBIT A\n\nThis exhibit governs the scope of services.";

const fakeParsedResult = {
  plainText: FAKE_PLAIN_TEXT,
  structuredContent: [
    {
      id: "block-0",
      type: "heading" as const,
      text: "EXHIBIT A",
      orderIndex: 0,
      headingPath: ["EXHIBIT A"],
      sourceStart: 0,
      sourceEnd: 9,
    },
    {
      id: "block-1",
      type: "paragraph" as const,
      text: "This exhibit governs the scope of services.",
      orderIndex: 1,
      headingPath: ["EXHIBIT A"],
      sourceStart: 11,
      sourceEnd: 54,
    },
  ],
  metadata: { wordCount: 9, parserVersion: "test-v1" },
  richJson: { type: "doc", content: [] },
};

const fakeChunks = [
  {
    chunkIndex: 0,
    orderIndex: 0,
    text: FAKE_PLAIN_TEXT,
    headingPath: ["EXHIBIT A"],
    sourceStart: 0,
    sourceEnd: 54,
    metadata: { blockCount: 2 },
  },
];

const baseInput = {
  projectId: "proj-1",
  documentId: "doc-1",
  title: "Exhibit A",
  originalFilename: "exhibit-a.docx",
  originalMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  originalSizeBytes: 1024,
  originalStorageKey: "uploads/proj-1/exhibit-a.docx",
  originalChecksum: "abc123",
  fileBuffer: Buffer.from("fake docx content"),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ingestDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChunkLegal.mockReturnValue(fakeChunks);
  });

  describe("DOCX exhibit (the working path)", () => {
    it("parses a .docx file and persists content and chunks", async () => {
      mockIsPdfFile.mockReturnValue(false);
      mockConvertDoc.mockResolvedValue({
        filename: "exhibit-a.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileBuffer: baseInput.fileBuffer,
        wasConverted: false,
      });
      mockParseDocx.mockResolvedValue(fakeParsedResult as any);

      const result = await ingestDocument(baseInput);

      expect(mockConvertDoc).toHaveBeenCalledWith({
        filename: "exhibit-a.docx",
        mimeType: baseInput.originalMimeType,
        fileBuffer: baseInput.fileBuffer,
      });
      expect(mockParseDocx).toHaveBeenCalledOnce();
      expect(mockChunkLegal).toHaveBeenCalledWith({
        parsedDocument: fakeParsedResult,
      });
      expect(result.chunkCount).toBe(1);
      expect(result.wasConverted).toBe(false);
      expect(result.documentId).toBe("doc-1");
      expect(result.documentVersionId).toBe("ver-1");
    });
  });

  describe("PDF exhibit (reference document path)", () => {
    it("parses a .pdf file and persists content and chunks", async () => {
      const pdfInput = {
        ...baseInput,
        originalFilename: "exhibit-b.pdf",
        originalMimeType: "application/pdf",
        originalStorageKey: "uploads/proj-1/exhibit-b.pdf",
      };

      mockIsPdfFile.mockReturnValue(true);
      mockParsePdf.mockResolvedValue(fakeParsedResult as any);

      const result = await ingestDocument(pdfInput);

      expect(mockParsePdf).toHaveBeenCalledWith({
        filename: "exhibit-b.pdf",
        fileBuffer: pdfInput.fileBuffer,
      });
      expect(mockConvertDoc).not.toHaveBeenCalled();
      expect(mockChunkLegal).toHaveBeenCalledWith({
        parsedDocument: fakeParsedResult,
      });
      expect(result.chunkCount).toBe(1);
      expect(result.wasConverted).toBe(false);
      expect(result.documentId).toBe("doc-1");
    });
  });

  describe("DOC exhibit (the failing path — root cause)", () => {
    /**
     * This test documents the known root cause: legacy .doc files pass
     * the isSupportedContractFile() check but DOC→DOCX conversion is not
     * implemented.  ingestDocument must therefore throw so the upload route
     * can return 202 with ingestionStatus: "failed".
     */
    it("throws 'DOC conversion is not implemented yet' for a .doc file", async () => {
      const docInput = {
        ...baseInput,
        originalFilename: "exhibit-a.doc",
        originalMimeType: "application/msword",
        originalStorageKey: "uploads/proj-1/exhibit-a.doc",
      };

      mockIsPdfFile.mockReturnValue(false);
      mockConvertDoc.mockRejectedValue(new Error("DOC conversion is not implemented yet."));

      await expect(ingestDocument(docInput)).rejects.toThrow(
        "DOC conversion is not implemented yet."
      );

      // Parsing must never be attempted when conversion fails
      expect(mockParseDocx).not.toHaveBeenCalled();
      expect(mockChunkLegal).not.toHaveBeenCalled();
    });
  });

  describe("empty document", () => {
    it("persists zero chunks when the parsed document has no content", async () => {
      mockIsPdfFile.mockReturnValue(false);
      mockConvertDoc.mockResolvedValue({
        filename: "exhibit-a.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileBuffer: baseInput.fileBuffer,
        wasConverted: false,
      });
      mockParseDocx.mockResolvedValue({
        ...fakeParsedResult,
        plainText: "",
        structuredContent: [],
      } as any);
      mockChunkLegal.mockReturnValue([]);

      const result = await ingestDocument(baseInput);

      expect(result.chunkCount).toBe(0);
    });
  });
});
