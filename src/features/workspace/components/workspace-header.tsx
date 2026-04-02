"use client";

import Link from "next/link";
import { Home, Save, ChevronRight, Settings2 } from "lucide-react";
import { ThemeToggle } from "@/src/features/workspace/components/theme-toggle";

type WorkspaceHeaderProps = {
  projectName: string;
  editorDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onOpenSettings: () => void;
};

export function WorkspaceHeader({
  projectName,
  editorDirty,
  isSaving,
  onSave,
  onOpenSettings,
}: WorkspaceHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/"
          className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Home size={14} />
          <span className="hidden sm:inline">Projects</span>
        </Link>
        <ChevronRight size={12} className="text-muted-foreground" />
        <span className="font-medium text-foreground">{projectName}</span>
      </div>
      <div className="flex items-center gap-3">
        {editorDirty && (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save size={13} />
            {isSaving ? "Saving..." : "Save Version"}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          title="Format Settings"
          className="flex items-center gap-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 size={15} />
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
