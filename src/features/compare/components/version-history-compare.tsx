"use client";

import { useEffect, useMemo, useState } from "react";

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

function sourceDisplay(version: VersionInfo) {
  if (version.createdBy) {
    return `User (${version.createdBy})`;
  }
  if (version.sourceLabel?.startsWith("applied")) {
    return "Agent run";
  }
  if (version.sourceLabel) {
    return version.sourceLabel;
  }
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

    rows.push({
      index: i,
      before: beforePart,
      after: afterPart,
      status,
    });
  }

  return rows;
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString();
}

export function VersionHistoryCompare({ documents }: VersionHistoryCompareProps) {
  const [activeDocumentId, setActiveDocumentId] = useState<string>(documents[0]?.id ?? "");
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? documents[0] ?? null,
    [activeDocumentId, documents]
  );

  const versionOptions = activeDocument?.versions ?? [];
  const [beforeVersionId, setBeforeVersionId] = useState<string>(versionOptions[1]?.id ?? versionOptions[0]?.id ?? "");
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
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Version History & Compare</h2>
        <p className="mt-2 text-sm text-slate-600">Upload documents to view version lineage.</p>
      </section>
    );
  }

  const beforeVersion =
    activeDocument.versions.find((version) => version.id === beforeVersionId) ??
    activeDocument.versions[1] ??
    activeDocument.versions[0];
  const afterVersion =
    activeDocument.versions.find((version) => version.id === afterVersionId) ??
    activeDocument.versions[0];

  const diffRows = buildParagraphDiff(beforeVersion?.plainText || "", afterVersion?.plainText || "");

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="text-sm font-semibold text-slate-900">Version History & Compare</h2>
        <p className="mt-1 text-xs text-slate-600">
          Inspect lineage and compare paragraph-level changes between two versions.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="text-xs text-slate-600">
            Document
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
              value={activeDocument.id}
              onChange={(event) => setActiveDocumentId(event.target.value)}
            >
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Before
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
              value={beforeVersion?.id || ""}
              onChange={(event) => setBeforeVersionId(event.target.value)}
            >
              {versionOptions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.versionNumber} - {sourceDisplay(version)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            After
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
              value={afterVersion?.id || ""}
              onChange={(event) => setAfterVersionId(event.target.value)}
            >
              {versionOptions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.versionNumber} - {sourceDisplay(version)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200">
        <div className="grid grid-cols-[1fr_1fr] border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
          <div className="border-r border-slate-200 p-2">
            <p className="font-semibold text-slate-700">Before</p>
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
            <p className="font-semibold text-slate-700">After</p>
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
            <p className="p-3 text-sm text-slate-600">No textual content available for compare.</p>
          ) : (
            diffRows.map((row) => (
              <div
                key={row.index}
                className={`grid grid-cols-[1fr_1fr] border-t border-slate-200 text-xs ${
                  row.status === "changed"
                    ? "bg-amber-50"
                    : row.status === "added"
                    ? "bg-emerald-50"
                    : row.status === "removed"
                    ? "bg-rose-50"
                    : "bg-white"
                }`}
              >
                <div className="border-r border-slate-200 p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    P{row.index + 1}
                  </p>
                  <p className="whitespace-pre-wrap text-slate-700">{row.before || "-"}</p>
                </div>
                <div className="p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {row.status}
                  </p>
                  <p className="whitespace-pre-wrap text-slate-700">{row.after || "-"}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
        Version lineage ({activeDocument.versions.length}):
        <div className="mt-1 flex flex-wrap gap-1">
          {activeDocument.versions.map((version) => (
            <span key={version.id} className="rounded border border-slate-300 bg-white px-2 py-0.5">
              v{version.versionNumber} - {sourceDisplay(version)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
