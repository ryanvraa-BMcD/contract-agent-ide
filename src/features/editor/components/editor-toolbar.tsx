"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table,
  Highlighter,
  Undo,
  Redo,
  Download,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type EditorToolbarProps = {
  editor: Editor | null;
  activeDocumentId?: string | null;
  projectId?: string;
};

type ToolbarButton = {
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  action: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
};

const SEPARATOR = "separator" as const;
type ToolbarItem = ToolbarButton | typeof SEPARATOR;

const toolbarItems: ToolbarItem[] = [
  {
    label: "Undo",
    shortcut: "Ctrl+Z",
    icon: Undo,
    action: (e) => e.chain().focus().undo().run(),
  },
  {
    label: "Redo",
    shortcut: "Ctrl+Y",
    icon: Redo,
    action: (e) => e.chain().focus().redo().run(),
  },
  SEPARATOR,
  {
    label: "Bold",
    shortcut: "Ctrl+B",
    icon: Bold,
    action: (e) => e.chain().focus().toggleBold().run(),
    isActive: (e) => e.isActive("bold"),
  },
  {
    label: "Italic",
    shortcut: "Ctrl+I",
    icon: Italic,
    action: (e) => e.chain().focus().toggleItalic().run(),
    isActive: (e) => e.isActive("italic"),
  },
  {
    label: "Underline",
    shortcut: "Ctrl+U",
    icon: Underline,
    action: (e) => e.chain().focus().toggleUnderline().run(),
    isActive: (e) => e.isActive("underline"),
  },
  {
    label: "Strikethrough",
    icon: Strikethrough,
    action: (e) => e.chain().focus().toggleStrike().run(),
    isActive: (e) => e.isActive("strike"),
  },
  SEPARATOR,
  {
    label: "Heading 1",
    icon: Heading1,
    action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (e) => e.isActive("heading", { level: 1 }),
  },
  {
    label: "Heading 2",
    icon: Heading2,
    action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    label: "Heading 3",
    icon: Heading3,
    action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (e) => e.isActive("heading", { level: 3 }),
  },
  SEPARATOR,
  {
    label: "Bullet List",
    icon: List,
    action: (e) => e.chain().focus().toggleBulletList().run(),
    isActive: (e) => e.isActive("bulletList"),
  },
  {
    label: "Numbered List",
    icon: ListOrdered,
    action: (e) => e.chain().focus().toggleOrderedList().run(),
    isActive: (e) => e.isActive("orderedList"),
  },
  SEPARATOR,
  {
    label: "Align Left",
    icon: AlignLeft,
    action: (e) => e.chain().focus().setTextAlign("left").run(),
    isActive: (e) => e.isActive({ textAlign: "left" }),
  },
  {
    label: "Align Center",
    icon: AlignCenter,
    action: (e) => e.chain().focus().setTextAlign("center").run(),
    isActive: (e) => e.isActive({ textAlign: "center" }),
  },
  {
    label: "Align Right",
    icon: AlignRight,
    action: (e) => e.chain().focus().setTextAlign("right").run(),
    isActive: (e) => e.isActive({ textAlign: "right" }),
  },
  {
    label: "Justify",
    icon: AlignJustify,
    action: (e) => e.chain().focus().setTextAlign("justify").run(),
    isActive: (e) => e.isActive({ textAlign: "justify" }),
  },
  SEPARATOR,
  {
    label: "Insert Table",
    icon: Table,
    action: (e) =>
      e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    label: "Highlight",
    icon: Highlighter,
    action: (e) => e.chain().focus().toggleHighlight().run(),
    isActive: (e) => e.isActive("highlight"),
  },
];

export function EditorToolbar({ editor, activeDocumentId, projectId }: EditorToolbarProps) {
  if (!editor) return null;

  const handleExport = async () => {
    if (!activeDocumentId || !projectId) return;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/documents/${activeDocumentId}/export`,
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "document.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-border bg-card px-2">
      {toolbarItems.map((item, idx) => {
        if (item === SEPARATOR) {
          return (
            <div key={`sep-${idx}`} className="mx-1 h-5 w-px bg-border" />
          );
        }
        const active = item.isActive?.(editor) ?? false;
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
            onClick={() => item.action(editor)}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon size={15} strokeWidth={2} />
          </button>
        );
      })}

      {activeDocumentId && projectId && (
        <>
          <div className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            title="Export as .docx"
            onClick={handleExport}
            className="flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download size={14} />
            <span>Export</span>
          </button>
        </>
      )}
    </div>
  );
}
