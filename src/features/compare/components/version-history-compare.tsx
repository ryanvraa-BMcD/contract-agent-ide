"use client";

import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows } from "lucide-react";

type VersionInfo = {
  id: string;
  versionNumber: number;
  createdAt: string;
  sourceLabel: string | null;
  createdBy: string | null;
  plainText: string;
};

type CompareDocument = {
  id: string;
  title: string;
  versions: VersionInfo[];
};

type VersionHistoryCompareProps = {
  documents: CompareDocument[];
};

type DiffRow = {
  index: number;
  before: string;
  after: string;
  status: "unchanged" | "changed" | "added" | "removed";
};

const STATUS_STYLES: Record<DiffRow["status"], string> = {
  unchanged: "bg-card",
  changed: "bg-warning/5",
  added: "bg-success/5",
  removed: "bg-destructive/5",
};

function sourceDisplay(version: VersionInfo) {
  if (version.createdBy) return `User (${version.createdBy})`;
  if (version.sourceLabel?.startsWith("applied")) return "Agent run";
  if (version.sourceLabel) return version.sourceLabel;
  return "System";
}

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildParagraphDiff(before: string, after: string): DiffRow[] {
  const beforeParagraphs = splitParagraphs(before);
  const afterParagraphs = splitParagraphs(after);
  const max = Math.max(beforeParagraphs.length, afterParagraphs.length);
  const rows: DiffRow[] = [];

  for (let i = 0; i < max; i += 1) {
    const beforePart = beforeParagraphs[i] ?? "";
    const afterPart = afterParagraphs[i] ?? "";

    let status: DiffRow["status"] = "unchanged";
    if (!beforePart && afterPart) status = "added";
    else if (beforePart && !afterPart) status = "removed";
    else if (beforePart !== afterPart) status = "changed";

    rows.push({ index: i, before: beforePart, after: afterPart, status });
  }

  return rows;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function VersionHistoryCompare({ documents }: VersionHistoryCompareProps) {
  const [activeDocumentId, setActiveDocumentId] = useState<string>(documents[0]?.id ?? "");
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? documents[0] ?? null,
    [activeDocumentId, documents],
  );

  const versionOptions = activeDocument?.versions ?? [];
  const [beforeVersionId, setBeforeVersionId] = useState<string>(
    versionOptions[1]?.id ?? versionOptions[0]?.id ?? "",
  );
  const [afterVersionId, setAfterVersionId] = useState<string>(versionOptions[0]?.id ?? "");

  useEffect(() => {
    if (!activeDocument) {
      setBeforeVersionId("");
      setAfterVersionId("");
      return;
    }
    const latest = activeDocument.versions[0];
    const previous = activeDocument.versions[1] ?? latest;
    setAfterVersionId(latest?.id ?? "");
    setBeforeVersionId(previous?.id ?? "");
  }, [activeDocument?.id]);

  if (!activeDocument) {
    return (
      <section className="mt-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <GitCompareArrows size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-card-foreground">
            Version History & Compare
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload documents to view version lineage.
        </p>
      </section>
    );
  }

  const beforeVersion =
    activeDocument.versions.find((v) => v.id === beforeVersionId) ??
    activeDocument.versions[1] ??
    activeDocument.versions[0];
  const afterVersion =
    activeDocument.versions.find((v) => v.id === afterVersionId) ??
    activeDocument.versions[0];

  const diffRows = buildParagraphDiff(
    beforeVersion?.plainText || "",
    afterVersion?.plainText || "",
  );

  const selectClass =
    "mt-1 w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs text-card-foreground outline-none focus:ring-1 focus:ring-ring";

  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-5">
      <div className="border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <GitCompareArrows size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-card-foreground">
            Version History & Compare
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Inspect lineage and compare paragraph-level changes between two versions.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="text-xs text-muted-foreground">
            Document
            <select
              className={selectClass}
              value={activeDocument.id}
              onChange={(e) => setActiveDocumentId(e.target.value)}
            >
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Before
            <select
              className={selectClass}
              value={beforeVersion?.id || ""}
              onChange={(e) => setBeforeVersionId(e.target.value)}
            >
              {versionOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} - {sourceDisplay(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            After
            <select
              className={selectClass}
              value={afterVersion?.id || ""}
              onChange={(e) => setAfterVersionId(e.target.value)}
            >
              {versionOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} - {sourceDisplay(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_1fr] border-b border-border bg-muted text-xs text-muted-foreground">
          <div className="border-r border-border p-2">
            <p className="font-semibold text-card-foreground">Before</p>
            {beforeVersion ? (
              <p>
                v{beforeVersion.versionNumber} | {sourceDisplay(beforeVersion)} |{" "}
                {formatDate(beforeVersion.createdAt)}
              </p>
            ) : (
              <p>No version selected</p>
            )}
          </div>
          <div className="p-2">
            <p className="font-semibold text-card-foreground">After</p>
            {afterVersion ? (
              <p>
                v{afterVersion.versionNumber} | {sourceDisplay(afterVersion)} |{" "}
                {formatDate(afterVersion.createdAt)}
              </p>
            ) : (
              <p>No version selected</p>
            )}
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto">
          {diffRows.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No textual content available for compare.
            </p>
          ) : (
            diffRows.map((row) => (
              <div
                key={row.index}
                className={`grid grid-cols-[1fr_1fr] border-t border-border text-xs ${STATUS_STYLES[row.status]}`}
              >
                <div className="border-r border-border p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    P{row.index + 1}
                  </p>
                  <p className="whitespace-pre-wrap text-card-foreground">
                    {row.before || "-"}
                  </p>
                </div>
                <div className="p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.status}
                  </p>
                  <p className="whitespace-pre-wrap text-card-foreground">
                    {row.after || "-"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border bg-muted p-2 text-[11px] text-muted-foreground">
        Version lineage ({activeDocument.versions.length}):
        <div className="mt-1 flex flex-wrap gap-1">
          {activeDocument.versions.map((v) => (
            <span
              key={v.id}
              className="rounded border border-border bg-card px-2 py-0.5 text-card-foreground"
            >
              v{v.versionNumber} - {sourceDisplay(v)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
