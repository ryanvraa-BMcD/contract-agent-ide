"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Highlight } from "@tiptap/extension-highlight";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useEffect, useCallback, useRef } from "react";
import { EditorToolbar } from "./editor-toolbar";
import { EditorPage } from "./editor-page";
import {
  TrackInsertion,
  TrackDeletion,
} from "@/src/features/editor/extensions/track-changes";
import type { ReviewProposal } from "@/src/features/review/types";
import type { ProjectStyleSettings } from "@/src/types/style-settings";

type DocumentEditorProps = {
  content: Record<string, unknown> | string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onContentChange?: (json: Record<string, unknown>) => void;
  editProposals?: ReviewProposal[];
  onProposalAccepted?: (proposalTitle: string) => void;
  onProposalRejected?: (proposalTitle: string) => void;
  activeDocumentId?: string | null;
  projectId?: string;
  styleSettings?: ProjectStyleSettings;
};

export function DocumentEditor({
  content,
  onDirtyChange,
  onContentChange,
  editProposals,
  onProposalAccepted,
  onProposalRejected,
  activeDocumentId,
  projectId,
  styleSettings,
}: DocumentEditorProps) {
  const appliedProposalsRef = useRef<Set<string>>(new Set());
  // Suppresses onUpdate during programmatic setContent/clearContent so loading
  // a document or switching versions does not trigger the auto-save timer.
  const isLoadingContentRef = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5] },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Highlight,
      Placeholder.configure({
        placeholder: "Start typing or upload a document...",
      }),
      TrackInsertion,
      TrackDeletion,
    ],
    editorProps: {
      attributes: {
        class: "outline-none min-h-[800px]",
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement;
        const trackEl = target.closest("[data-track]");
        if (!trackEl) return false;

        const proposalId = trackEl.getAttribute("data-proposal-id");
        if (!proposalId) return false;

        const isInsertion = trackEl.tagName === "INS";
        const isDeletion = trackEl.tagName === "DEL";

        const rect = trackEl.getBoundingClientRect();
        showTrackChangePopup(rect, proposalId, isInsertion, isDeletion);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (isLoadingContentRef.current) return;
      onDirtyChange?.(true);
      onContentChange?.(ed.getJSON() as Record<string, unknown>);
    },
  });

  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    isLoadingContentRef.current = true;
    if (!content) {
      editor.commands.clearContent();
    } else {
      editor.commands.setContent(content);
    }
    isLoadingContentRef.current = false;
    onDirtyChange?.(false);
    appliedProposalsRef.current.clear();
  }, [editor, content, onDirtyChange]);

  useEffect(() => {
    if (!editor || !editProposals || editProposals.length === 0) return;

    for (const proposal of editProposals) {
      if (appliedProposalsRef.current.has(proposal.title)) continue;

      for (const op of proposal.operations) {
        if (op.opType === "replace_text" && op.findText && op.replaceText) {
          applyReplaceAsTrackChange(editor, proposal.title, op.findText, op.replaceText);
        } else if (op.opType === "insert_before" && op.findText && op.insertText) {
          applyInsertAsTrackChange(editor, proposal.title, op.findText, op.insertText, "before");
        } else if (op.opType === "insert_after" && op.findText && op.insertText) {
          applyInsertAsTrackChange(editor, proposal.title, op.findText, op.insertText, "after");
        }
      }
      appliedProposalsRef.current.add(proposal.title);
    }
  }, [editor, editProposals]);

  function showTrackChangePopup(
    rect: DOMRect,
    proposalId: string,
    isInsertion: boolean,
    _isDeletion: boolean,
  ) {
    const existing = document.getElementById("track-change-popup");
    if (existing) existing.remove();

    const popup = document.createElement("div");
    popup.id = "track-change-popup";
    popup.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 4}px;
      left: ${rect.left}px;
      z-index: 9999;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 6px;
      display: flex;
      gap: 4px;
    `;

    const acceptBtn = document.createElement("button");
    acceptBtn.textContent = "Accept";
    acceptBtn.style.cssText =
      "padding: 4px 10px; font-size: 11px; font-weight: 600; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer;";
    acceptBtn.onclick = () => {
      if (!editorRef.current) return;
      acceptTrackChange(editorRef.current, proposalId, isInsertion);
      onProposalAccepted?.(proposalId);
      popup.remove();
    };

    const rejectBtn = document.createElement("button");
    rejectBtn.textContent = "Reject";
    rejectBtn.style.cssText =
      "padding: 4px 10px; font-size: 11px; font-weight: 600; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;";
    rejectBtn.onclick = () => {
      if (!editorRef.current) return;
      rejectTrackChange(editorRef.current, proposalId, isInsertion);
      onProposalRejected?.(proposalId);
      popup.remove();
    };

    popup.appendChild(acceptBtn);
    popup.appendChild(rejectBtn);
    document.body.appendChild(popup);

    const dismiss = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node)) {
        popup.remove();
        document.removeEventListener("mousedown", dismiss);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", dismiss), 0);
  }

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar editor={editor} activeDocumentId={activeDocumentId} projectId={projectId} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorPage styleSettings={styleSettings}>
          <EditorContent editor={editor} />
        </EditorPage>
      </div>
    </div>
  );
}

/**
 * Search ProseMirror doc for a text string and return the {from, to} positions
 * that account for node boundaries (paragraph open/close tokens, etc.).
 */
function findTextInDoc(editor: Editor, searchText: string): { from: number; to: number } | null {
  const doc = editor.state.doc;
  let found: { from: number; to: number } | null = null;

  const normalizedSearch = searchText.replace(/\s+/g, " ").trim();

  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return;

    const blockText = node.textContent;
    const normalizedBlock = blockText.replace(/\s+/g, " ");
    const idx = normalizedBlock.indexOf(normalizedSearch);
    if (idx === -1) return;

    // Walk through text nodes to map character offset to ProseMirror positions
    let charOffset = 0;
    let startPos: number | null = null;
    let endPos: number | null = null;

    node.forEach((child, childOffset) => {
      if (startPos !== null && endPos !== null) return;
      if (!child.isText || !child.text) return;

      const childText = child.text;
      const childStart = charOffset;
      const childEnd = charOffset + childText.length;

      if (startPos === null && idx >= childStart && idx < childEnd) {
        startPos = pos + 1 + childOffset + (idx - childStart);
      }
      if (startPos !== null && endPos === null) {
        const searchEnd = idx + normalizedSearch.length;
        if (searchEnd <= childEnd) {
          endPos = pos + 1 + childOffset + (searchEnd - childStart);
        }
      }

      charOffset = childEnd;
    });

    if (startPos !== null && endPos !== null) {
      found = { from: startPos, to: endPos };
    }
  });

  // Fallback: try a broader multi-node search across the whole doc
  if (!found) {
    const fullText = doc.textBetween(1, doc.content.size, "\n", "\n");
    const idx = fullText.indexOf(normalizedSearch);
    if (idx === -1) return null;

    // Map the character index to a ProseMirror position by walking the doc
    let charCount = 0;
    let startPos: number | null = null;
    let endPos: number | null = null;

    doc.descendants((node, pos) => {
      if (startPos !== null && endPos !== null) return false;
      if (node.isText && node.text) {
        const nodeStart = charCount;
        const nodeEnd = charCount + node.text.length;

        if (startPos === null && idx >= nodeStart && idx < nodeEnd) {
          startPos = pos + (idx - nodeStart);
        }
        if (startPos !== null && endPos === null) {
          const searchEnd = idx + normalizedSearch.length;
          if (searchEnd <= nodeEnd) {
            endPos = pos + (searchEnd - nodeStart);
          }
        }
        charCount = nodeEnd;
      } else if (node.isBlock && !node.isTextblock) {
        // skip
      } else if (node.isTextblock && charCount > 0) {
        charCount += 1; // account for the \n separator
      }
    });

    if (startPos !== null && endPos !== null) {
      found = { from: startPos, to: endPos };
    }
  }

  return found;
}

function applyReplaceAsTrackChange(
  editor: Editor,
  proposalTitle: string,
  findText: string,
  replaceText: string,
) {
  const range = findTextInDoc(editor, findText);
  if (!range) {
    console.warn(`[track-changes] Could not find text to replace: "${findText.slice(0, 60)}..."`);
    return;
  }

  editor
    .chain()
    .focus()
    .setTextSelection(range)
    .setMark("trackDeletion", { proposalId: proposalTitle })
    .setTextSelection({ from: range.to, to: range.to })
    .insertContent({
      type: "text",
      text: replaceText,
      marks: [{ type: "trackInsertion", attrs: { proposalId: proposalTitle } }],
    })
    .run();
}

function applyInsertAsTrackChange(
  editor: Editor,
  proposalTitle: string,
  findText: string,
  insertText: string,
  position: "before" | "after",
) {
  const range = findTextInDoc(editor, findText);
  if (!range) {
    console.warn(`[track-changes] Could not find anchor text: "${findText.slice(0, 60)}..."`);
    return;
  }

  const insertPos = position === "before" ? range.from : range.to;

  editor
    .chain()
    .focus()
    .setTextSelection({ from: insertPos, to: insertPos })
    .insertContent({
      type: "text",
      text: insertText,
      marks: [{ type: "trackInsertion", attrs: { proposalId: proposalTitle } }],
    })
    .run();
}

function acceptTrackChange(
  editor: Editor,
  proposalId: string,
  isInsertion: boolean,
) {
  const positions: { from: number; to: number; isIns: boolean }[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.attrs.proposalId !== proposalId) continue;
      if (mark.type.name === "trackInsertion" || mark.type.name === "trackDeletion") {
        positions.push({
          from: pos,
          to: pos + node.nodeSize,
          isIns: mark.type.name === "trackInsertion",
        });
      }
    }
  });

  // Process in reverse order to keep positions stable
  positions.sort((a, b) => b.from - a.from);

  for (const p of positions) {
    if (p.isIns) {
      // Accepting insertion: remove the mark, keep the text
      editor.chain().setTextSelection({ from: p.from, to: p.to }).unsetMark("trackInsertion").run();
    } else {
      // Accepting deletion: delete the text
      editor.chain().setTextSelection({ from: p.from, to: p.to }).deleteSelection().run();
    }
  }
}

function rejectTrackChange(
  editor: Editor,
  proposalId: string,
  _isInsertion: boolean,
) {
  const positions: { from: number; to: number; isIns: boolean }[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.attrs.proposalId !== proposalId) continue;
      if (mark.type.name === "trackInsertion" || mark.type.name === "trackDeletion") {
        positions.push({
          from: pos,
          to: pos + node.nodeSize,
          isIns: mark.type.name === "trackInsertion",
        });
      }
    }
  });

  positions.sort((a, b) => b.from - a.from);

  for (const p of positions) {
    if (p.isIns) {
      // Rejecting insertion: delete the inserted text
      editor.chain().setTextSelection({ from: p.from, to: p.to }).deleteSelection().run();
    } else {
      // Rejecting deletion: keep the text, remove the mark
      editor.chain().setTextSelection({ from: p.from, to: p.to }).unsetMark("trackDeletion").run();
    }
  }
}
