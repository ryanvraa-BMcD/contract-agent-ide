import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ParsedDocument } from "@/src/types/document";

export type ParseDocxInput = {
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
};

type TipTapMark = { type: string; attrs?: Record<string, unknown> };
type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TipTapMark[];
  content?: TipTapNode[];
  text?: string;
};

type NumberingDef = {
  abstractNumId: string;
  levels: Record<string, { numFmt: string }>;
};

type XmlObj = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function attr(node: unknown, name: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const v = (node as XmlObj)[`@_${name}`];
  return typeof v === "string" ? v : undefined;
}

// ---------------------------------------------------------------------------
// Text extraction from runs - only reads <w:t> text nodes, ignoring property
// elements like rPr, pPr, tblPr etc. that contain attribute values.
// ---------------------------------------------------------------------------

const TEXT_CONTAINER_KEYS = new Set(["r", "hyperlink", "smartTag", "sdt", "sdtContent", "ins", "del", "moveTo", "moveFrom"]);
const SKIP_KEYS = new Set(["rPr", "pPr", "tblPr", "tblGrid", "trPr", "tcPr", "sectPr", "numPr", "sdtPr", "sdtEndPr", "bookmarkStart", "bookmarkEnd", "proofErr", "lastRenderedPageBreak"]);

function extractRunText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return "";
  if (typeof node !== "object") return "";

  const obj = node as XmlObj;
  let result = "";

  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("@_")) continue;
    if (SKIP_KEYS.has(key)) continue;

    if (key === "t") {
      for (const t of asArray(value)) {
        if (typeof t === "string") result += t;
        else if (typeof t === "number") result += String(t);
        else if (t && typeof t === "object") {
          const inner = (t as XmlObj)["#text"];
          if (inner !== undefined) result += String(inner);
        }
      }
      continue;
    }
    if (key === "tab") { result += "\t"; continue; }
    if (key === "br") { result += "\n"; continue; }
    if (key === "cr") { result += "\n"; continue; }

    if (TEXT_CONTAINER_KEYS.has(key) || key === "#text") {
      for (const child of asArray(value)) {
        result += extractRunText(child);
      }
      continue;
    }

    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        for (const item of value) result += extractRunText(item);
      } else {
        result += extractRunText(value);
      }
    }
  }

  return result;
}

/**
 * Extract plain text from a paragraph, only reading actual text content.
 */
function extractParagraphText(paragraph: XmlObj): string {
  let text = "";
  for (const key of ["r", "hyperlink", "smartTag", "sdt", "sdtContent", "ins", "del"]) {
    const children = paragraph[key];
    if (!children) continue;
    for (const child of asArray(children)) {
      text += extractRunText(child);
    }
  }
  return text.replace(/\r/g, "");
}

// ---------------------------------------------------------------------------
// Run properties & marks
// ---------------------------------------------------------------------------

function getRunMarks(run: XmlObj): TipTapMark[] {
  const rPr = run.rPr;
  if (!rPr || typeof rPr !== "object") return [];
  const props = rPr as XmlObj;
  const marks: TipTapMark[] = [];

  if (props.b !== undefined) marks.push({ type: "bold" });
  if (props.i !== undefined) marks.push({ type: "italic" });
  if (props.u !== undefined) marks.push({ type: "underline" });
  if (props.strike !== undefined) marks.push({ type: "strike" });
  if (props.highlight !== undefined) marks.push({ type: "highlight" });

  return marks;
}

// ---------------------------------------------------------------------------
// Paragraph properties
// ---------------------------------------------------------------------------

function getParagraphStyle(paragraph: XmlObj): string | undefined {
  const pPr = paragraph.pPr;
  if (!pPr || typeof pPr !== "object") return undefined;
  const pStyle = (pPr as XmlObj).pStyle;
  if (!pStyle || typeof pStyle !== "object") return undefined;
  return attr(pStyle, "val");
}

function headingLevelFromStyle(style?: string) {
  if (!style) return null;
  const match = /^Heading([1-9])$/i.exec(style);
  if (!match) return null;
  return Number(match[1]);
}

function getParagraphAlignment(paragraph: XmlObj): string | undefined {
  const pPr = paragraph.pPr;
  if (!pPr || typeof pPr !== "object") return undefined;
  const jc = (pPr as XmlObj).jc;
  if (!jc || typeof jc !== "object") return undefined;
  const val = attr(jc, "val");
  if (!val) return undefined;
  const map: Record<string, string> = { left: "left", center: "center", right: "right", both: "justify", justify: "justify" };
  return map[val.toLowerCase()];
}

function getNumPr(paragraph: XmlObj): { numId: string; ilvl: number } | null {
  const pPr = paragraph.pPr;
  if (!pPr || typeof pPr !== "object") return null;
  const numPr = (pPr as XmlObj).numPr;
  if (!numPr || typeof numPr !== "object") return null;
  const numPrObj = numPr as XmlObj;

  const ilvl = parseInt(attr(numPrObj.ilvl, "val") ?? "0", 10);
  const numId = attr(numPrObj.numId, "val") ?? "0";

  if (numId === "0") return null;
  return { numId, ilvl };
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

function parseNumberingXml(xml: string): Map<string, NumberingDef> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  const parsed = parser.parse(xml) as XmlObj;
  const numbering = parsed.numbering as XmlObj | undefined;
  if (!numbering) return new Map();

  const abstractNums = asArray(numbering.abstractNum);
  const abstractMap = new Map<string, Record<string, { numFmt: string }>>();

  for (const an of abstractNums) {
    if (!an || typeof an !== "object") continue;
    const anObj = an as XmlObj;
    const abstractNumId = attr(anObj, "abstractNumId") ?? "";
    const lvls = asArray(anObj.lvl);
    const levels: Record<string, { numFmt: string }> = {};
    for (const lvl of lvls) {
      if (!lvl || typeof lvl !== "object") continue;
      const lvlObj = lvl as XmlObj;
      const ilvl = attr(lvlObj, "ilvl") ?? "0";
      const numFmt = attr(lvlObj.numFmt, "val") ?? "bullet";
      levels[ilvl] = { numFmt };
    }
    abstractMap.set(abstractNumId, levels);
  }

  const nums = asArray(numbering.num);
  const result = new Map<string, NumberingDef>();
  for (const num of nums) {
    if (!num || typeof num !== "object") continue;
    const numObj = num as XmlObj;
    const numId = attr(numObj, "numId") ?? "";
    const abstractNumId = attr((numObj as XmlObj).abstractNumId, "val") ?? "";
    const levels = abstractMap.get(abstractNumId) ?? {};
    result.set(numId, { abstractNumId, levels });
  }

  return result;
}

function isOrderedList(numId: string, ilvl: number, numberingMap: Map<string, NumberingDef>): boolean {
  const def = numberingMap.get(numId);
  if (!def) return false;
  const level = def.levels[String(ilvl)];
  if (!level) return false;
  return level.numFmt !== "bullet" && level.numFmt !== "none";
}

// ---------------------------------------------------------------------------
// Build TipTap nodes from runs within a paragraph
// ---------------------------------------------------------------------------

function collectRuns(container: XmlObj): XmlObj[] {
  const runs: XmlObj[] = [];

  for (const key of ["r", "hyperlink", "smartTag", "sdt", "sdtContent", "ins", "del", "moveTo", "moveFrom"]) {
    const children = container[key];
    if (!children) continue;
    for (const child of asArray(children)) {
      if (!child || typeof child !== "object") continue;
      const childObj = child as XmlObj;

      if (key === "r") {
        runs.push(childObj);
      } else {
        // Wrapper elements contain runs inside them
        runs.push(...collectRuns(childObj));
      }
    }
  }

  return runs;
}

function buildRunNodes(paragraph: XmlObj): TipTapNode[] {
  const runs = collectRuns(paragraph);
  const nodes: TipTapNode[] = [];

  for (const run of runs) {
    const text = extractRunText(run).replace(/\r/g, "");
    if (!text) continue;

    const marks = getRunMarks(run);
    const textNode: TipTapNode = { type: "text", text };
    if (marks.length > 0) textNode.marks = marks;
    nodes.push(textNode);
  }

  if (nodes.length === 0) {
    const fallbackText = extractParagraphText(paragraph).trim();
    if (fallbackText) {
      nodes.push({ type: "text", text: fallbackText });
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function buildTableNode(tbl: XmlObj): TipTapNode {
  const rows = asArray(tbl.tr);
  const tableContent: TipTapNode[] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row || typeof row !== "object") continue;
    const rowObj = row as XmlObj;
    const cells = asArray(rowObj.tc);
    const cellNodes: TipTapNode[] = [];

    for (const cell of cells) {
      if (!cell || typeof cell !== "object") continue;
      const cellObj = cell as XmlObj;
      const cellParagraphs = asArray(cellObj.p);
      const cellContent: TipTapNode[] = [];

      for (const cp of cellParagraphs) {
        if (!cp || typeof cp !== "object") continue;
        const runNodes = buildRunNodes(cp as XmlObj);
        if (runNodes.length > 0) {
          cellContent.push({ type: "paragraph", content: runNodes });
        }
      }

      const cellType = rowIdx === 0 ? "tableHeader" : "tableCell";
      cellNodes.push({
        type: cellType,
        content: cellContent.length > 0 ? cellContent : [{ type: "paragraph" }],
      });
    }

    if (cellNodes.length > 0) {
      tableContent.push({ type: "tableRow", content: cellNodes });
    }
  }

  return { type: "table", content: tableContent };
}

// ---------------------------------------------------------------------------
// Process a single paragraph into structured + TipTap content
// ---------------------------------------------------------------------------

function processParagraph(
  pObj: XmlObj,
  headingTrail: string[],
  state: { orderIndex: number; sourceOffset: number },
  numberingMap: Map<string, NumberingDef>,
): {
  structured: ParsedDocument["structuredContent"][number] | null;
  tipTapNode: TipTapNode | null;
  listInfo: { type: "bulletList" | "orderedList"; item: TipTapNode } | null;
} {
  const paragraphText = extractParagraphText(pObj).trim();

  // Preserve empty paragraphs for visual spacing in TipTap
  if (!paragraphText) {
    return {
      structured: null,
      tipTapNode: { type: "paragraph" },
      listInfo: null,
    };
  }

  const style = getParagraphStyle(pObj);
  const headingLevel = headingLevelFromStyle(style);
  const isHeading = headingLevel !== null;

  if (isHeading && headingLevel !== null) {
    headingTrail.length = headingLevel - 1;
    headingTrail[headingLevel - 1] = paragraphText;
  }

  const headingPath = [...headingTrail];
  const sourceStart = state.sourceOffset;
  const sourceEnd = sourceStart + paragraphText.length;
  state.sourceOffset = sourceEnd + 2;

  const structured: ParsedDocument["structuredContent"][number] = {
    id: `block-${state.orderIndex}`,
    type: isHeading ? "heading" : "paragraph",
    text: paragraphText,
    orderIndex: state.orderIndex,
    headingPath,
    sourceStart,
    sourceEnd,
    metadata: style ? { style } : undefined,
  };
  state.orderIndex += 1;

  const alignment = getParagraphAlignment(pObj);
  const numPr = getNumPr(pObj);
  const runNodes = buildRunNodes(pObj);

  if (numPr) {
    const ordered = isOrderedList(numPr.numId, numPr.ilvl, numberingMap);
    const listType = ordered ? "orderedList" : "bulletList";

    const listItemContent: TipTapNode[] = [
      {
        type: "paragraph",
        ...(alignment ? { attrs: { textAlign: alignment } } : {}),
        content: runNodes.length > 0 ? runNodes : undefined,
      },
    ];

    return {
      structured,
      tipTapNode: null,
      listInfo: { type: listType, item: { type: "listItem", content: listItemContent } },
    };
  }

  if (isHeading && headingLevel !== null) {
    return {
      structured,
      tipTapNode: {
        type: "heading",
        attrs: { level: headingLevel, ...(alignment ? { textAlign: alignment } : {}) },
        content: runNodes.length > 0 ? runNodes : undefined,
      },
      listInfo: null,
    };
  }

  return {
    structured,
    tipTapNode: {
      type: "paragraph",
      ...(alignment ? { attrs: { textAlign: alignment } } : {}),
      content: runNodes.length > 0 ? runNodes : undefined,
    },
    listInfo: null,
  };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export type ParseDocxResult = ParsedDocument & {
  richJson: TipTapNode;
};

export async function parseDocx(input: ParseDocxInput): Promise<ParseDocxResult> {
  if (!input.filename.toLowerCase().endsWith(".docx")) {
    throw new Error("parseDocx expected a .docx file.");
  }

  const zip = await JSZip.loadAsync(input.fileBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) {
    throw new Error("Invalid .docx file: word/document.xml was not found.");
  }

  let numberingMap = new Map<string, NumberingDef>();
  const numberingXml = await zip.file("word/numbering.xml")?.async("text");
  if (numberingXml) {
    numberingMap = parseNumberingXml(numberingXml);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  const parsedXml = parser.parse(documentXml) as {
    document?: { body?: XmlObj };
  };

  const body = parsedXml.document?.body;
  if (!body) {
    return {
      plainText: "",
      structuredContent: [],
      metadata: { wordCount: 0, parserVersion: "docx-xml-v3" },
      richJson: { type: "doc", content: [{ type: "paragraph" }] },
    };
  }

  // Walk body children in document order to preserve interleaved p/tbl
  const structuredContent: ParsedDocument["structuredContent"] = [];
  const headingTrail: string[] = [];
  const state = { orderIndex: 0, sourceOffset: 0 };
  const tipTapContent: TipTapNode[] = [];

  type PendingList = { type: "bulletList" | "orderedList"; items: TipTapNode[] };
  let pendingList: PendingList | null = null;

  function flushPendingList() {
    if (pendingList && pendingList.items.length > 0) {
      tipTapContent.push({ type: pendingList.type, content: pendingList.items });
      pendingList = null;
    }
  }

  // Process body children in order. Body may have p, tbl, sdt at top level.
  // We iterate all keys and process them in the order they appear.
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith("@_") || SKIP_KEYS.has(key)) continue;

    if (key === "p") {
      for (const p of asArray(value)) {
        if (!p || typeof p !== "object") continue;
        const result = processParagraph(p as XmlObj, headingTrail, state, numberingMap);
        if (result.structured) structuredContent.push(result.structured);

        if (result.listInfo) {
          if (!pendingList || pendingList.type !== result.listInfo.type) {
            flushPendingList();
            pendingList = { type: result.listInfo.type, items: [] };
          }
          pendingList.items.push(result.listInfo.item);
        } else if (result.tipTapNode) {
          flushPendingList();
          tipTapContent.push(result.tipTapNode);
        }
      }
    } else if (key === "tbl") {
      flushPendingList();
      for (const tbl of asArray(value)) {
        if (!tbl || typeof tbl !== "object") continue;
        tipTapContent.push(buildTableNode(tbl as XmlObj));
      }
    } else if (key === "sdt") {
      // Structured document tags can wrap paragraphs and tables
      for (const sdtNode of asArray(value)) {
        if (!sdtNode || typeof sdtNode !== "object") continue;
        const sdtContent = (sdtNode as XmlObj).sdtContent;
        if (!sdtContent || typeof sdtContent !== "object") continue;
        const sc = sdtContent as XmlObj;

        for (const sp of asArray(sc.p)) {
          if (!sp || typeof sp !== "object") continue;
          const result = processParagraph(sp as XmlObj, headingTrail, state, numberingMap);
          if (result.structured) structuredContent.push(result.structured);
          if (result.listInfo) {
            if (!pendingList || pendingList.type !== result.listInfo.type) {
              flushPendingList();
              pendingList = { type: result.listInfo.type, items: [] };
            }
            pendingList.items.push(result.listInfo.item);
          } else if (result.tipTapNode) {
            flushPendingList();
            tipTapContent.push(result.tipTapNode);
          }
        }

        for (const st of asArray(sc.tbl)) {
          if (!st || typeof st !== "object") continue;
          flushPendingList();
          tipTapContent.push(buildTableNode(st as XmlObj));
        }
      }
    }
  }
  flushPendingList();

  const plainText = structuredContent.map((block) => block.text).join("\n\n");
  const words = plainText.trim() ? plainText.trim().split(/\s+/) : [];

  const richJson: TipTapNode = {
    type: "doc",
    content: tipTapContent.length > 0 ? tipTapContent : [{ type: "paragraph" }],
  };

  return {
    plainText,
    structuredContent,
    metadata: {
      wordCount: words.length,
      parserVersion: "docx-xml-v3",
    },
    richJson,
  };
}
