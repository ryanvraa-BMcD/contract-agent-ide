"use client";

import { DragEvent } from "react";
import {
  FileText,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from "lucide-react";

type SidebarDocument = {
  id: string;
  title: string;
  sizeBytes: number;
  activeVersion: { versionNumber: number } | null;
};

type DocumentListItemProps = {
  doc: SidebarDocument;
  isActive: boolean;
  isInContext: boolean;
  isFirst: boolean;
  isLast: boolean;
  canReorder: boolean;
  confirmDelete: string | null;
  deleting: string | null;
  dragOverDocId: string | null;
  draggedDocId: string | null;
  onSelect: (id: string) => void;
  onToggleContext: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onConfirmDelete: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDocDragStart: (e: DragEvent, id: string) => void;
  onDocDragOver: (e: DragEvent, id: string) => void;
  onDocDrop: (e: DragEvent) => void;
  onDocDragEnd: () => void;
  onDragLeave: () => void;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentListItem({
  doc,
  isActive,
  isInContext,
  isFirst,
  isLast,
  canReorder,
  confirmDelete,
  deleting,
  dragOverDocId,
  draggedDocId,
  onSelect,
  onToggleContext,
  onMoveUp,
  onMoveDown,
  onConfirmDelete,
  onDelete,
  onDocDragStart,
  onDocDragOver,
  onDocDrop,
  onDocDragEnd,
  onDragLeave,
}: DocumentListItemProps) {
  const isConfirming = confirmDelete === doc.id;
  const isDragTarget = dragOverDocId === doc.id && draggedDocId !== doc.id;
  const isDraggingThis = draggedDocId === doc.id;

  return (
    <li
      className={`group relative transition-opacity ${isDraggingThis ? "opacity-40" : ""}`}
      onDragOver={(e) => onDocDragOver(e, doc.id)}
      onDrop={onDocDrop}
      onDragLeave={onDragLeave}
    >
      {isDragTarget && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-full bg-primary" />
      )}
      {isConfirming ? (
        <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2">
          <p className="flex-1 text-xs text-destructive">Delete this document?</p>
          <button
            type="button"
            onClick={() => onDelete(doc.id)}
            disabled={deleting === doc.id}
            className="rounded bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
          >
            {deleting === doc.id ? "..." : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => onConfirmDelete(null)}
            className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-border"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center">
          {canReorder && (
            <div
              draggable
              onDragStart={(e) => onDocDragStart(e, doc.id)}
              onDragEnd={onDocDragEnd}
              className="flex shrink-0 cursor-grab items-center pl-1 pr-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical size={13} />
            </div>
          )}
          <button
            type="button"
            onClick={() => onSelect(doc.id)}
            className={`min-w-0 flex-1 rounded-md py-2 text-left transition-colors ${
              canReorder ? "pl-1 pr-2.5" : "px-2.5"
            } ${
              isActive
                ? "bg-accent ring-1 ring-primary/20"
                : "hover:bg-sidebar-accent"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                role="checkbox"
                aria-checked={isInContext}
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleContext(doc.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleContext(doc.id);
                  }
                }}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  isInContext
                    ? "border-primary bg-primary"
                    : "border-input bg-card"
                }`}
              >
                {isInContext && <Check size={10} className="text-primary-foreground" />}
              </span>
              <FileText size={14} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-xs font-medium ${
                    isActive ? "text-accent-foreground" : "text-card-foreground"
                  }`}
                >
                  {doc.title}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>v{doc.activeVersion?.versionNumber ?? "?"}</span>
                  <span className="opacity-50">|</span>
                  <span>{formatSize(doc.sizeBytes)}</span>
                </div>
              </div>
            </div>
          </button>
        </div>
      )}
      {!isConfirming && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 group-hover:flex">
          {canReorder && (
            <>
              <button
                type="button"
                disabled={isFirst}
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                title="Move up"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                disabled={isLast}
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                title="Move down"
              >
                <ChevronDown size={12} />
              </button>
            </>
          )}
          <button
            type="button"
            disabled={deleting === doc.id}
            onClick={(e) => { e.stopPropagation(); onConfirmDelete(doc.id); }}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Remove document"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </li>
  );
}
