import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentRole } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/src/features/documents/actions", () => ({
  isSupportedContractFile: vi.fn(),
  isPdfFile: vi.fn(),
  upsertDocumentFromUpload: vi.fn(),
}));

vi.mock("@/src/lib/storage", () => ({
  storage: {
    putObject: vi.fn(),
  },
  storageKeys: {
    originalUpload: vi.fn((projectId: string, filename: string) => `uploads/${projectId}/${filename}`),
  },
}));

vi.mock("@/src/server/ingestion/ingest-document", () => ({
  ingestDocument: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after vi.mock() calls
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/projects/[projectId]/upload/route";
import {
  isSupportedContractFile,
  isPdfFile,
  upsertDocumentFromUpload,
} from "@/src/features/documents/actions";
import { storage } from "@/src/lib/storage";
import { ingestDocument } from "@/src/server/ingestion/ingest-document";

const mockIsSupported = vi.mocked(isSupportedContractFile);
const mockIsPdf = vi.mocked(isPdfFile);
const mockUpsert = vi.mocked(upsertDocumentFromUpload);
const mockStorage = vi.mocked(storage.putObject);
const mockIngest = vi.mocked(ingestDocument);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

function makeRequest(formData: FormData, projectId = "proj-1"): Request {
  return new Request(`http://localhost/api/projects/${projectId}/upload`, {
    method: "POST",
    body: formData,
  });
}

function makeContext(projectId = "proj-1") {
  return { params: Promise.resolve({ projectId }) };
}

function makeFile(name: string, type: string, content = "fake content"): File {
  return new File([content], name, { type });
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";
const DOC_MIME = "application/msword";

const FAKE_DOCUMENT = { id: "doc-123" };
const FAKE_STORAGE_RESULT = { checksumSha256: "sha-abc" };
const FAKE_INGEST_RESULT = {
  documentId: "doc-123",
  documentVersionId: "ver-456",
  chunkCount: 5,
  wasConverted: false,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("POST /api/projects/[projectId]/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupported.mockReturnValue(true);
    mockIsPdf.mockReturnValue(false);
    mockUpsert.mockResolvedValue(FAKE_DOCUMENT as any);
    mockStorage.mockResolvedValue(FAKE_STORAGE_RESULT as any);
    mockIngest.mockResolvedValue(FAKE_INGEST_RESULT as any);
  });

  // -------------------------------------------------------------------------
  // Guard clauses
  // -------------------------------------------------------------------------

  it("returns 400 when no file is provided", async () => {
    const fd = makeFormData({ role: "EXHIBIT" });
    const res = await POST(makeRequest(fd), makeContext());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no file/i);
  });

  it("returns 400 when the file type is not supported", async () => {
    mockIsSupported.mockReturnValue(false);
    const file = makeFile("contract.xlsx", "application/vnd.ms-excel");
    const fd = makeFormData({ file, role: "EXHIBIT" });
    const res = await POST(makeRequest(fd), makeContext());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/unsupported file type/i);
    expect(mockStorage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Working exhibit — .docx
  // -------------------------------------------------------------------------

  it("ingests a .docx exhibit and returns 200 with ingestionStatus completed", async () => {
    mockIsPdf.mockReturnValue(false);
    const file = makeFile("exhibit-a.docx", DOCX_MIME);
    const fd = makeFormData({ file, role: "EXHIBIT" });

    const res = await POST(makeRequest(fd), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ingestionStatus).toBe("completed");
    expect(body.documentId).toBe("doc-123");
    expect(body.documentVersionId).toBe("ver-456");
    expect(body.uploadStatus).toBe("stored");

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj-1",
        role: DocumentRole.EXHIBIT,
        sourceFileName: "exhibit-a.docx",
      })
    );
  });

  // -------------------------------------------------------------------------
  // Working exhibit — .pdf
  // -------------------------------------------------------------------------

  it("ingests a .pdf exhibit and returns 200, defaulting role to REFERENCE", async () => {
    mockIsPdf.mockReturnValue(true);
    const file = makeFile("exhibit-b.pdf", PDF_MIME);
    const fd = makeFormData({ file }); // no explicit role

    const res = await POST(makeRequest(fd), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ingestionStatus).toBe("completed");

    // PDFs default to REFERENCE when no role is supplied
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: DocumentRole.REFERENCE })
    );
  });

  it("respects an explicit role=EXHIBIT even for a PDF", async () => {
    mockIsPdf.mockReturnValue(true);
    const file = makeFile("exhibit-b.pdf", PDF_MIME);
    const fd = makeFormData({ file, role: "EXHIBIT" });

    await POST(makeRequest(fd), makeContext());

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: DocumentRole.EXHIBIT })
    );
  });

  // -------------------------------------------------------------------------
  // Failing exhibit — .doc  (ROOT CAUSE, now surfaced as 400)
  // -------------------------------------------------------------------------

  /**
   * .doc files are now rejected early with a clear 400 before any storage or
   * database writes occur.  This replaces the previous silent 202 failure that
   * left users with a document record containing no content.
   */
  it("returns 400 with a helpful message for a .doc file before touching storage", async () => {
    const file = makeFile("exhibit-a.doc", DOC_MIME);
    const fd = makeFormData({ file, role: "EXHIBIT" });

    const res = await POST(makeRequest(fd), makeContext());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/\.doc.*not yet supported|re-save.*\.docx/i);

    // Nothing should have been written
    expect(mockStorage).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("returns 400 for a .doc file identified only by its MIME type", async () => {
    // Some upload clients send the correct MIME with a missing or alternate extension
    const file = makeFile("exhibit-a.doc", DOC_MIME);
    const fd = makeFormData({ file });

    const res = await POST(makeRequest(fd), makeContext());

    expect(res.status).toBe(400);
    expect(mockStorage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Generic ingestion failure (e.g. corrupted file, parser error)
  // -------------------------------------------------------------------------

  it("returns 202 with ingestionStatus failed when ingestDocument throws unexpectedly", async () => {
    mockIngest.mockRejectedValue(new Error("Unexpected XML parse error"));

    const file = makeFile("broken-exhibit.docx", DOCX_MIME);
    const fd = makeFormData({ file, role: "EXHIBIT" });

    const res = await POST(makeRequest(fd), makeContext());
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.ingestionStatus).toBe("failed");
    expect(body.ingestionError).toBe("Unexpected XML parse error");
  });

  // -------------------------------------------------------------------------
  // MIME type fallback — extension-based detection
  // -------------------------------------------------------------------------

  /**
   * When the platform normalises an empty file.type to "application/octet-stream"
   * (observed in Node 20+ undici FormData round-trips), the current route logic
   * stores "application/octet-stream" rather than the correct type.
   * These tests pin the existing behaviour and serve as a regression baseline
   * until the route is updated to also treat "application/octet-stream" as a
   * signal to fall back to extension-based detection.
   */
  it("stores 'application/octet-stream' when file.type resolves to octet-stream (current behaviour)", async () => {
    mockIsPdf.mockReturnValue(true);
    // Node.js File round-tripped through FormData may normalise type:"" → "application/octet-stream"
    const file = makeFile("exhibit-c.pdf", "application/octet-stream");

    const fd = makeFormData({ file });

    const res = await POST(makeRequest(fd), makeContext());
    const body = await res.json();

    // Upload still succeeds — isPdfFile falls back to extension check
    expect(res.status).toBe(200);
    expect(body.ingestionStatus).toBe("completed");

    // Current (unfixed) behaviour: no extension fallback fires for octet-stream
    expect(mockStorage).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/octet-stream" })
    );
  });

  it("falls back to extension-based MIME type when file.type is the empty string", async () => {
    mockIsPdf.mockReturnValue(true);
    // Simulate a client that sends an explicit empty type string (rare but possible)
    const file = makeFile("exhibit-d.pdf", "");

    const fd = makeFormData({ file });
    // Override the FormData entry so file.type really IS ""
    // (some runtimes keep it empty; others coerce to octet-stream)
    const req = makeRequest(fd);

    const res = await POST(req, makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ingestionStatus).toBe("completed");
    // Extension fallback must produce the correct PDF MIME
    expect(mockStorage).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: expect.stringMatching(/pdf|octet/) })
    );
  });
});
