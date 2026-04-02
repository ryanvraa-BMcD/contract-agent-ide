"use client";

import { ReactNode } from "react";
import type { ProjectStyleSettings } from "@/src/types/style-settings";
import { DEFAULT_STYLE_SETTINGS } from "@/src/types/style-settings";

type EditorPageProps = {
  children: ReactNode;
  styleSettings?: ProjectStyleSettings;
};

export function EditorPage({ children, styleSettings }: EditorPageProps) {
  const s = styleSettings ?? DEFAULT_STYLE_SETTINGS;

  const cssVars = {
    "--doc-font-family": `'${s.fontFamily}', 'Segoe UI', sans-serif`,
    "--doc-font-size": s.fontSize,
    "--doc-line-height": String(s.lineHeight),
    "--doc-p-spacing": `${s.paragraphSpacingAfter / 16}em`,
    "--doc-h1-size": s.headings.h1.fontSize,
    "--doc-h1-weight": s.headings.h1.bold ? "700" : "400",
    "--doc-h2-size": s.headings.h2.fontSize,
    "--doc-h2-weight": s.headings.h2.bold ? "700" : "400",
    "--doc-h3-size": s.headings.h3.fontSize,
    "--doc-h3-weight": s.headings.h3.bold ? "600" : "400",
    "--doc-h4-size": s.headings.h4.fontSize,
    "--doc-h4-weight": s.headings.h4.bold ? "600" : "400",
    "--doc-h5-size": s.headings.h5.fontSize,
    "--doc-h5-weight": s.headings.h5.bold ? "600" : "400",
  } as React.CSSProperties;

  return (
    <div className="min-h-full bg-muted px-8 py-6">
      <div
        className="mx-auto bg-white shadow-lg"
        style={{
          width: "816px",
          minHeight: "1056px",
          paddingTop: `${s.pageMargins.top}px`,
          paddingRight: `${s.pageMargins.right}px`,
          paddingBottom: `${s.pageMargins.bottom}px`,
          paddingLeft: `${s.pageMargins.left}px`,
          fontFamily: `'${s.fontFamily}', 'Segoe UI', sans-serif`,
          fontSize: s.fontSize,
          lineHeight: String(s.lineHeight),
          ...cssVars,
        }}
      >
        {children}
      </div>
    </div>
  );
}
