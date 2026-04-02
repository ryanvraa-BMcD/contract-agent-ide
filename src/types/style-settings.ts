export type HeadingStyle = {
  fontSize: string;
  bold: boolean;
};

export type ProjectStyleSettings = {
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
  paragraphSpacingAfter: number;
  headings: {
    h1: HeadingStyle;
    h2: HeadingStyle;
    h3: HeadingStyle;
    h4: HeadingStyle;
    h5: HeadingStyle;
  };
  pageMargins: { top: number; right: number; bottom: number; left: number };
};

export const DEFAULT_STYLE_SETTINGS: ProjectStyleSettings = {
  fontFamily: "Calibri",
  fontSize: "11pt",
  lineHeight: 1.5,
  paragraphSpacingAfter: 8,
  headings: {
    h1: { fontSize: "24pt", bold: true },
    h2: { fontSize: "18pt", bold: true },
    h3: { fontSize: "14pt", bold: true },
    h4: { fontSize: "12pt", bold: true },
    h5: { fontSize: "11pt", bold: true },
  },
  pageMargins: { top: 96, right: 96, bottom: 96, left: 96 },
};

export function parseStyleSettings(raw: unknown): ProjectStyleSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STYLE_SETTINGS };
  const obj = raw as Record<string, unknown>;

  const headings = (obj.headings ?? {}) as Record<string, unknown>;
  const margins = (obj.pageMargins ?? {}) as Record<string, unknown>;

  function parseHeading(key: string, fallback: HeadingStyle): HeadingStyle {
    const h = headings[key];
    if (!h || typeof h !== "object") return fallback;
    const ho = h as Record<string, unknown>;
    return {
      fontSize: typeof ho.fontSize === "string" ? ho.fontSize : fallback.fontSize,
      bold: typeof ho.bold === "boolean" ? ho.bold : fallback.bold,
    };
  }

  return {
    fontFamily: typeof obj.fontFamily === "string" ? obj.fontFamily : DEFAULT_STYLE_SETTINGS.fontFamily,
    fontSize: typeof obj.fontSize === "string" ? obj.fontSize : DEFAULT_STYLE_SETTINGS.fontSize,
    lineHeight: typeof obj.lineHeight === "number" ? obj.lineHeight : DEFAULT_STYLE_SETTINGS.lineHeight,
    paragraphSpacingAfter:
      typeof obj.paragraphSpacingAfter === "number"
        ? obj.paragraphSpacingAfter
        : DEFAULT_STYLE_SETTINGS.paragraphSpacingAfter,
    headings: {
      h1: parseHeading("h1", DEFAULT_STYLE_SETTINGS.headings.h1),
      h2: parseHeading("h2", DEFAULT_STYLE_SETTINGS.headings.h2),
      h3: parseHeading("h3", DEFAULT_STYLE_SETTINGS.headings.h3),
      h4: parseHeading("h4", DEFAULT_STYLE_SETTINGS.headings.h4),
      h5: parseHeading("h5", DEFAULT_STYLE_SETTINGS.headings.h5),
    },
    pageMargins: {
      top: typeof margins.top === "number" ? margins.top : DEFAULT_STYLE_SETTINGS.pageMargins.top,
      right: typeof margins.right === "number" ? margins.right : DEFAULT_STYLE_SETTINGS.pageMargins.right,
      bottom: typeof margins.bottom === "number" ? margins.bottom : DEFAULT_STYLE_SETTINGS.pageMargins.bottom,
      left: typeof margins.left === "number" ? margins.left : DEFAULT_STYLE_SETTINGS.pageMargins.left,
    },
  };
}
