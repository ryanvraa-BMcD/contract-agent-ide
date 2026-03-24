const DOC_MIME_TYPE = "application/msword";
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ConvertDocInput = {
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
};

export type ConvertDocResult = {
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
  wasConverted: boolean;
};

function isDocFile(filename: string, mimeType: string) {
  return filename.toLowerCase().endsWith(".doc") || mimeType === DOC_MIME_TYPE;
}

function isDocxFile(filename: string, mimeType: string) {
  return filename.toLowerCase().endsWith(".docx") || mimeType === DOCX_MIME_TYPE;
}

export async function convertDocToDocxIfNeeded(
  input: ConvertDocInput
): Promise<ConvertDocResult> {
  if (isDocxFile(input.filename, input.mimeType)) {
    return {
      filename: input.filename,
      mimeType: DOCX_MIME_TYPE,
      fileBuffer: input.fileBuffer,
      wasConverted: false,
    };
  }

  if (!isDocFile(input.filename, input.mimeType)) {
    throw new Error("Unsupported document format. Expected .doc or .docx.");
  }

  // TODO: Implement .doc -> .docx conversion (e.g. LibreOffice headless worker).
  // TODO: Preserve conversion diagnostics for audit trail and retries.
  throw new Error("DOC conversion is not implemented yet.");
}
