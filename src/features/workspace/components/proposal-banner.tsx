"use client";

import { Zap, X } from "lucide-react";

type ProposalBannerProps = {
  count: number;
  onIncorporate: () => void;
  onDismiss: () => void;
};

export function ProposalBanner({ count, onIncorporate, onDismiss }: ProposalBannerProps) {
  if (count === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-accent px-4 py-2.5">
      <Zap size={14} className="shrink-0 text-accent-foreground" />
      <span className="text-xs font-medium text-accent-foreground">
        {count} edit {count === 1 ? "proposal" : "proposals"} ready
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onIncorporate}
          className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Incorporate Changes
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Dismiss proposals"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
