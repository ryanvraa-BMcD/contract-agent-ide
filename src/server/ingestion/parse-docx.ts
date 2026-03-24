import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ParsedDocument } from "@/src/types/document";

export type ParseDocxInput = {
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
};

type XmlNode = Record<string, unknown> | string | number | boolean | null | undefined;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function extractText(node: XmlNode): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }

  let combined = "";
  for (const [key, value] of Object.entries(node)) {
    if (key === "t") {
      combined += asArray(value as XmlNode | XmlNode[]).map((item) => extractText(item)).join("");
      continue;
    }
    if (key === "tab") {
      combined += "\t";
      continue;
    }
    if (key === "br") {
      combined += "\n";
      continue;
    }
    if (key === "cr") {
      combined += "\n";
      continue;
    }

    if (Array.isArray(value)) {
      combined += value.map((item) => extractText(item as XmlNode)).join("");
    } else if (typeof value === "object" && value !== null) {
      combined += extractText(value as XmlNode);
    }
  }

  return combined;
}

function getParagraphStyle(paragraph: Record<string, unknown>): string | undefined {
  const pPr = paragraph.pPr;
  if (!pPr || typeof pPr !== "object") return undefined;

  const pStyle = (pPr as Record<string, unknown>).pStyle;
  if (!pStyle || typeof pStyle !== "object") return undefined;

  const styleVal = (pStyle as Record<string, unknown>).val;
  return typeof styleVal === "string" ? styleVal : undefined;
}

function headingLevelFromStyle(style?: string) {
  if (!style) return null;
  const match = /^Heading([1-9])$/i.exec(style);
  if (!match) return null;
  return Number(match[1]);
}

export async function parseDocx(input: ParseDocxInput): Promise<ParsedDocument> {
  if (!input.filename.toLowerCase().endsWith(".docx")) {
    throw new Error("parseDocx expected a .docx file.");
  }

  const zip = await JSZip.loadAsync(input.fileBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) {
    throw new Error("Invalid .docx file: word/document.xml was not found.");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  const parsedXml = parser.parse(documentXml) as {
    document?: {
      body?: {
        p?: Record<string, unknown> | Record<string, unknown>[];
      };
    };
  };

  const paragraphs = asArray(parsedXml.document?.body?.p);
  const structuredContent: ParsedDocument["structuredContent"] = [];
  const headingTrail: string[] = [];
  let orderIndex = 0;
  let sourceOffset = 0;

  for (const paragraph of paragraphs) {
    const paragraphText = extractText(paragraph).replace(/\r/g, "").trim();
    if (!paragraphText) continue;

    const style = getParagraphStyle(paragraph);
    const headingLevel = headingLevelFromStyle(style);
    const isHeading = headingLevel !== null;

    if (isHeading && headingLevel !== null) {
      headingTrail.length = headingLevel - 1;
      headingTrail[headingLevel - 1] = paragraphText;
    }

    const headingPath = isHeading ? [...headingTrail] : [...headingTrail];
    const sourceStart = sourceOffset;
    const sourceEnd = sourceStart + paragraphText.length;
    sourceOffset = sourceEnd + 2;

    structuredContent.push({
      id: `block-${orderIndex}`,
      type: isHeading ? "heading" : "paragraph",
      text: paragraphText,
      orderIndex,
      headingPath,
      sourceStart,
      sourceEnd,
      metadata: style ? { style } : undefined,
    });
    orderIndex += 1;
  }

  const plainText = structuredContent.map((block) => block.text).join("\n\n");
  const words = plainText.trim() ? plainText.trim().split(/\s+/) : [];

  return {
    plainText,
    structuredContent,
    metadata: {
      wordCount: words.length,
      parserVersion: "docx-xml-v1",
    },
  };
}
