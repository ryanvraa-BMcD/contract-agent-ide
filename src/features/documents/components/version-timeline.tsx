"use client";

import { Upload, User, Bot } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type VersionEntry = {
  id: string;
  versionNumber: number;
  createdAt: string;
  sourceLabel: string | null;
  createdBy: string | null;
};

type VersionTimelineProps = {
  documentTitle: string;
  versions: VersionEntry[];
  activeVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
};

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function sourceIcon(version: VersionEntry): LucideIcon {
  if (version.sourceLabel?.startsWith("applied")) return Bot;
  if (version.createdBy) return User;
  return Upload;
}

function sourceText(version: VersionEntry) {
  if (version.createdBy) return version.createdBy;
  if (version.sourceLabel?.startsWith("applied")) return "Agent edit";
  if (version.sourceLabel) return version.sourceLabel;
  return "Upload";
}

export function VersionTimeline({
  documentTitle,
  versions,
  activeVersionId,
  onSelectVersion,
}: VersionTimelineProps) {
  if (versions.length === 0) {
    return (
      <div className="px-3 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Version History
        </h3>
        <p className="mt-2 text-xs text-muted-foreground">No versions yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="border-t border-sidebar-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Version History
        </h3>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={documentTitle}>
          {documentTitle}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="relative">
          <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />
          <ul className="relative space-y-0.5">
            {versions.map((version) => {
              const Icon = sourceIcon(version);
              const isActive = version.id === activeVersionId;
              return (
                <li key={version.id}>
                  <button
                    type="button"
                    onClick={() => onSelectVersion(version.id)}
                    className={`group relative flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
                      isActive
                        ? "bg-accent ring-1 ring-primary/20"
                        : "hover:bg-sidebar-accent"
                    }`}
                  >
                    <span
                      className={`relative z-10 mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-colors ${
                        isActive
                          ? "bg-primary"
                          : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
                      }`}
                    >
                      <Icon size={10} className="text-primary-foreground" strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-semibold ${
                            isActive ? "text-accent-foreground" : "text-card-foreground"
                          }`}
                        >
                          v{version.versionNumber}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeTime(version.createdAt)}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {sourceText(version)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
