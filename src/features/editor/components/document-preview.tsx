"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Loader2, FileWarning } from "lucide-react";

type DocumentPreviewProps = {
  projectId: string;
  documentId: string;
  mimeType: string;
  title: string;
  isInContext: boolean;
};

const PDF_TYPES = new Set([
  "application/pdf",
]);

const DOCX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function isPdf(mimeType: string, filename?: string) {
  return PDF_TYPES.has(mimeType) || filename?.toLowerCase().endsWith(".pdf");
}

function isDocx(mimeType: string, filename?: string) {
  return DOCX_TYPES.has(mimeType) || filename?.toLowerCase().endsWith(".docx");
}

export function DocumentPreview({
  projectId,
  documentId,
  mimeType,
  title,
  isInContext,
}: DocumentPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = `/api/projects/${projectId}/documents/${documentId}/preview`;

  useEffect(() => {
    if (!isDocx(mimeType, title)) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(previewUrl);
        if (!res.ok) throw new Error(`Failed to load document (${res.status})`);

        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const { renderAsync } = await import("docx-preview");
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = "";
        await renderAsync(new Blob([buffer]), containerRef.current, undefined, {
          className: "docx-preview-container",
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Preview failed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewUrl, mimeType, title]);

  return (
    <div className="flex h-full flex-col">
      {/* Context badge bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2">
        <span className="truncate text-xs font-medium text-foreground">
          {title}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {isInContext ? (
            <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-medium text-success">
              <CheckCircle2 size={12} />
              In AI context
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <XCircle size={12} />
              Not in context
            </span>
          )}
        </span>
      </div>

      {/* Preview area */}
      <div className="min-h-0 flex-1 overflow-auto bg-muted">
        {isPdf(mimeType, title) && (
          <iframe
            src={previewUrl}
            title={`Preview: ${title}`}
            className="h-full w-full border-0"
          />
        )}

        {isDocx(mimeType, title) && (
          <>
            {loading && (
              <div className="flex h-full items-center justify-center">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Rendering document...
                </span>
              </div>
            )}
            {error && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <FileWarning size={32} className="mx-auto text-destructive/60" />
                  <p className="mt-2 text-sm text-destructive">{error}</p>
                </div>
              </div>
            )}
            <div
              ref={containerRef}
              className={loading || error ? "hidden" : "p-4"}
            />
          </>
        )}

        {!isPdf(mimeType, title) && !isDocx(mimeType, title) && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <FileWarning size={40} className="mx-auto text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                Preview not available for this file type
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Only .pdf and .docx files can be previewed.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
