import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ProjectStyleSettings } from "@/src/types/style-settings";
import { DEFAULT_STYLE_SETTINGS } from "@/src/types/style-settings";

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

/** Convert Word half-points (1/2 pt) to a CSS pt string. */
function halfPointsToPt(val: string | undefined): string | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  if (isNaN(n)) return null;
  return `${n / 2}pt`;
}

/** Convert Word twips (1/1440 inch) to CSS px (at 96 dpi). */
function twipsToPx(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  if (isNaN(n)) return null;
  return Math.round((n / 1440) * 96);
}

function createParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
}

function extractDefaultsFromStyles(stylesXml: string): Partial<ProjectStyleSettings> {
  const parser = createParser();
  const parsed = parser.parse(stylesXml) as XmlObj;
  const styles = parsed.styles as XmlObj | undefined;
  if (!styles) return {};

  const result: Partial<ProjectStyleSettings> = {};

  // Extract document defaults
  const docDefaults = styles.docDefaults as XmlObj | undefined;
  if (docDefaults) {
    const rPrDefault = docDefaults.rPrDefault as XmlObj | undefined;
    if (rPrDefault) {
      const rPr = rPrDefault.rPr as XmlObj | undefined;
      if (rPr) {
        const rFonts = rPr.rFonts as XmlObj | undefined;
        const font = attr(rFonts, "ascii") ?? attr(rFonts, "hAnsi") ?? attr(rFonts, "cs");
        if (font) result.fontFamily = font;

        const sz = attr(rPr.sz, "val");
        const ptSize = halfPointsToPt(sz);
        if (ptSize) result.fontSize = ptSize;
      }
    }

    const pPrDefault = docDefaults.pPrDefault as XmlObj | undefined;
    if (pPrDefault) {
      const pPr = pPrDefault.pPr as XmlObj | undefined;
      if (pPr) {
        const spacing = pPr.spacing as XmlObj | undefined;
        if (spacing) {
          const after = attr(spacing, "after");
          if (after) {
            const twips = parseInt(after, 10);
            if (!isNaN(twips)) result.paragraphSpacingAfter = Math.round(twips / 20);
          }
          const lineVal = attr(spacing, "line");
          const lineRule = attr(spacing, "lineRule");
          if (lineVal && (!lineRule || lineRule === "auto")) {
            const raw = parseInt(lineVal, 10);
            if (!isNaN(raw)) result.lineHeight = parseFloat((raw / 240).toFixed(2));
          }
        }
      }
    }
  }

  // Extract heading styles
  const headings: Partial<ProjectStyleSettings["headings"]> = {};
  const styleList = asArray(styles.style);
  for (const s of styleList) {
    if (!s || typeof s !== "object") continue;
    const sObj = s as XmlObj;
    const styleId = attr(sObj, "styleId") ?? "";
    const match = /^Heading([1-5])$/i.exec(styleId);
    if (!match) continue;

    const level = parseInt(match[1], 10) as 1 | 2 | 3 | 4 | 5;
    const key = `h${level}` as keyof ProjectStyleSettings["headings"];
    const rPr = sObj.rPr as XmlObj | undefined;

    let fontSize = DEFAULT_STYLE_SETTINGS.headings[key].fontSize;
    let bold = DEFAULT_STYLE_SETTINGS.headings[key].bold;

    if (rPr) {
      const sz = attr(rPr.sz, "val");
      const ptSize = halfPointsToPt(sz);
      if (ptSize) fontSize = ptSize;
      if (rPr.b !== undefined) bold = true;
      if (rPr.b === false) bold = false;
    }

    headings[key] = { fontSize, bold };
  }

  if (Object.keys(headings).length > 0) {
    result.headings = {
      ...DEFAULT_STYLE_SETTINGS.headings,
      ...headings,
    };
  }

  return result;
}

function extractMarginsFromDocument(documentXml: string): Partial<ProjectStyleSettings> {
  const parser = createParser();
  const parsed = parser.parse(documentXml) as XmlObj;
  const doc = parsed.document as XmlObj | undefined;
  if (!doc) return {};
  const body = doc.body as XmlObj | undefined;
  if (!body) return {};

  const sectPr = body.sectPr as XmlObj | undefined;
  if (!sectPr) return {};

  const pgMar = sectPr.pgMar as XmlObj | undefined;
  if (!pgMar) return {};

  const top = twipsToPx(attr(pgMar, "top"));
  const right = twipsToPx(attr(pgMar, "right"));
  const bottom = twipsToPx(attr(pgMar, "bottom"));
  const left = twipsToPx(attr(pgMar, "left"));

  if (top === null && right === null && bottom === null && left === null) return {};

  return {
    pageMargins: {
      top: top ?? DEFAULT_STYLE_SETTINGS.pageMargins.top,
      right: right ?? DEFAULT_STYLE_SETTINGS.pageMargins.right,
      bottom: bottom ?? DEFAULT_STYLE_SETTINGS.pageMargins.bottom,
      left: left ?? DEFAULT_STYLE_SETTINGS.pageMargins.left,
    },
  };
}

export async function extractDocxStyles(fileBuffer: Buffer): Promise<ProjectStyleSettings> {
  const zip = await JSZip.loadAsync(fileBuffer);

  let fromStyles: Partial<ProjectStyleSettings> = {};
  const stylesEntry = zip.file("word/styles.xml");
  if (stylesEntry) {
    const stylesXml = await stylesEntry.async("text");
    fromStyles = extractDefaultsFromStyles(stylesXml);
  }

  let fromDocument: Partial<ProjectStyleSettings> = {};
  const documentEntry = zip.file("word/document.xml");
  if (documentEntry) {
    const documentXml = await documentEntry.async("text");
    fromDocument = extractMarginsFromDocument(documentXml);
  }

  return {
    ...DEFAULT_STYLE_SETTINGS,
    ...fromStyles,
    ...fromDocument,
    headings: {
      ...DEFAULT_STYLE_SETTINGS.headings,
      ...(fromStyles.headings ?? {}),
    },
    pageMargins: {
      ...DEFAULT_STYLE_SETTINGS.pageMargins,
      ...(fromDocument.pageMargins ?? {}),
    },
  };
}
