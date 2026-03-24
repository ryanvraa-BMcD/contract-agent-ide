"use client";

import type { WorkspaceMode } from "@/src/lib/validation";

type ModeToolbarProps = {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
};

const modes: WorkspaceMode[] = ["Ask", "Plan", "Edit", "Compare"];

export function ModeToolbar({ mode, onModeChange }: ModeToolbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mode</span>
        <select
          value={mode}
          onChange={(event) => onModeChange(event.target.value as WorkspaceMode)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 outline-none ring-blue-500 focus:ring-2"
        >
          {modes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="text-xs text-slate-500">Contract Agent IDE</div>
    </header>
  );
}
