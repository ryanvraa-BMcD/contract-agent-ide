"use client";

import { ReactNode } from "react";

type EditorPageProps = {
  children: ReactNode;
};

export function EditorPage({ children }: EditorPageProps) {
  return (
    <div className="min-h-full bg-muted px-8 py-6">
      <div
        className="mx-auto bg-white shadow-lg"
        style={{
          width: "816px",
          minHeight: "1056px",
          padding: "96px",
          fontFamily: "'Calibri', 'Segoe UI', sans-serif",
          fontSize: "11pt",
          lineHeight: "1.5",
        }}
      >
        {children}
      </div>
    </div>
  );
}
