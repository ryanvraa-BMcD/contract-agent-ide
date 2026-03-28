import { PDFParse } from "pdf-parse";
import type { ParsedDocument, StructuredBlock, StructuredBlockType } from "@/src/types/document";
import type { ParseDocxResult } from "@/src/server/ingestion/parse-docx";

export type ParsePdfInput = {
  filename: string;
  fileBuffer: Buffer;
};

const HEADING_PATTERNS = [
  /^(ARTICLE|SECTION|EXHIBIT|SCHEDULE|APPENDIX|ANNEX|ATTACHMENT|RECITALS?|WHEREAS)\b/i,
  /^\d+\.\s+[A-Z]/,
  /^\d+\.\d+\.?\s+[A-Z]/,
  /^[IVXLC]+\.\s+/,
  /^[A-Z][A-Z\s,]{4,}$/,
];

function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;
  return HEADING_PATTERNS.some((p) => p.test(trimmed));
}

function isListItem(line: string): boolean {
  const trimmed = line.trim();
  return /^(\(\w+\)|\d+\)|\w\)|\u2022|\u2013|\u2014|-)\s/.test(trimmed);
}

function classifyLine(line: string): StructuredBlockType {
  if (isLikelyHeading(line)) return "heading";
  if (isListItem(line)) return "list_item";
  return "paragraph";
}

function buildStructuredBlocks(text: string): StructuredBlock[] {
  const lines = text.split(/\n/);
  const blocks: StructuredBlock[] = [];
  const headingStack: string[] = [];
  let orderIndex = 0;
  let charOffset = 0;

  let buffer = "";
  let bufferType: StructuredBlockType = "paragraph";
  let bufferStart = 0;

  function flushBuffer() {
    const trimmed = buffer.trim();
    if (!trimmed) {
      buffer = "";
      return;
    }
    blocks.push({
      id: `pdf-block-${orderIndex}`,
      type: bufferType,
      text: trimmed,
      orderIndex,
      headingPath: [...headingStack],
      sourceStart: bufferStart,
      sourceEnd: bufferStart + buffer.length,
    });
    orderIndex++;
    buffer = "";
  }

  for (const line of lines) {
    const lineType = classifyLine(line);
    const trimmed = line.trim();

    if (!trimmed) {
      flushBuffer();
      charOffset += line.length + 1;
      continue;
    }

    if (lineType === "heading") {
      flushBuffer();
      headingStack.length = 0;
      headingStack.push(trimmed);

      blocks.push({
        id: `pdf-block-${orderIndex}`,
        type: "heading",
        text: trimmed,
        orderIndex,
        headingPath: [...headingStack],
        sourceStart: charOffset,
        sourceEnd: charOffset + line.length,
      });
      orderIndex++;
      charOffset += line.length + 1;
      continue;
    }

    if (lineType !== bufferType && buffer.trim()) {
      flushBuffer();
    }

    if (!buffer) {
      bufferStart = charOffset;
      bufferType = lineType;
    }
    buffer += (buffer ? "\n" : "") + trimmed;
    charOffset += line.length + 1;
  }

  flushBuffer();
  return blocks;
}

export async function parsePdf(input: ParsePdfInput): Promise<ParseDocxResult> {
  const pdf = new PDFParse({ data: new Uint8Array(input.fileBuffer) });
  const textResult = await pdf.getText();
  const plainText = textResult.text || "";
  await pdf.destroy();

  const structuredContent = buildStructuredBlocks(plainText);

  const wordCount = plainText
    .split(/\s+/)
    .filter((w: string) => w.length > 0).length;

  return {
    plainText,
    structuredContent,
    metadata: {
      title: input.filename.replace(/\.pdf$/i, ""),
      wordCount,
      parserVersion: "pdf-parse-2.0",
    },
    richJson: null as any,
  };
}
