"use client";

import {
  FileText,
  GitCompareArrows,
  Eye,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

export type CenterView = "editor" | "compare" | "preview";

const VIEW_CONFIG = [
  ["editor", "Document", FileText],
  ["compare", "Compare", GitCompareArrows],
  ["preview", "Preview", Eye],
] as const;

type CenterViewTabsProps = {
  activeDocumentTitle: string | null;
  projectName: string;
  centerView: CenterView;
  onCenterViewChange: (view: CenterView) => void;
  sidebarCollapsed: boolean;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
  hasActiveDocument: boolean;
};

export function CenterViewTabs({
  activeDocumentTitle,
  projectName,
  centerView,
  onCenterViewChange,
  sidebarCollapsed,
  onSidebarCollapsedChange,
  hasActiveDocument,
}: CenterViewTabsProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
      <button
        type="button"
        onClick={() => onSidebarCollapsedChange(!sidebarCollapsed)}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
      >
        {sidebarCollapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
      </button>

      <span className="mr-auto truncate text-xs font-medium text-foreground">
        {activeDocumentTitle ?? projectName}
      </span>

      <div className="flex items-center gap-1">
        {VIEW_CONFIG.map(([view, label, Icon]) => (
          <button
            key={view}
            type="button"
            onClick={() => onCenterViewChange(view)}
            disabled={view === "preview" && !hasActiveDocument}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              centerView === view
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
