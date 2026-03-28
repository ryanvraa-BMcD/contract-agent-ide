"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  FileText,
  GitCompareArrows,
  Save,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { ChatPanel } from "@/src/features/chat/components/chat-panel";
import { VersionHistoryCompare } from "@/src/features/compare/components/version-history-compare";
import { DocumentSidebar } from "@/src/features/documents/components/document-sidebar";
import { VersionTimeline } from "@/src/features/documents/components/version-timeline";
import { DocumentEditor } from "@/src/features/editor/components/document-editor";
import { ThemeToggle } from "@/src/features/workspace/components/theme-toggle";
import type { ReviewProposal } from "@/src/features/review/types";
import type { WorkspaceMode } from "@/src/lib/validation";

type WorkspaceDocument = {
  id: string;
  title: string;
  role: "MAIN_AGREEMENT" | "EXHIBIT" | "REFERENCE";
  originalFilename: string;
  sizeBytes: number;
  updatedAt: string;
  activeVersion: {
    versionNumber: number;
  } | null;
  versions: {
    id: string;
    versionNumber: number;
    createdAt: string;
    sourceLabel: string | null;
    createdBy: string | null;
    plainText: string;
    richJson?: unknown;
  }[];
};

type WorkspaceMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
  citations?: {
    documentId: string;
    versionId: string;
    chunkId: string;
    snippet: string;
  }[];
};

type WorkspaceLayoutProps = {
  projectId: string;
  projectName: string;
  documents: WorkspaceDocument[];
  threadId: string | null;
  initialMessages: WorkspaceMessage[];
};

type CenterView = "editor" | "compare";

export function WorkspaceLayout({
  projectId,
  projectName,
  documents,
  threadId,
  initialMessages,
}: WorkspaceLayoutProps) {
  const [mode, setMode] = useState<WorkspaceMode>("Ask");
  const [editProposals, setEditProposals] = useState<ReviewProposal[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>(
    documents.map((d) => d.id),
  );
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(
    documents[0]?.id ?? null,
  );
  const [activeVersionId, setActiveVersionId] = useState<string | null>(
    documents[0]?.versions[0]?.id ?? null,
  );
  const [centerView, setCenterView] = useState<CenterView>("editor");
  const [editorDirty, setEditorDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const editorContentRef = useRef<Record<string, unknown> | null>(null);
  const router = useRouter();

  const activeDocument = documents.find((d) => d.id === activeDocumentId) ?? null;
  const activeVersion =
    activeDocument?.versions.find((v) => v.id === activeVersionId) ??
    activeDocument?.versions[0] ??
    null;

  const handleSelectDocument = useCallback(
    (documentId: string) => {
      setActiveDocumentId(documentId);
      const doc = documents.find((d) => d.id === documentId);
      setActiveVersionId(doc?.versions[0]?.id ?? null);
      setEditorDirty(false);
    },
    [documents],
  );

  const handleSelectVersion = useCallback(
    (versionId: string) => {
      setActiveVersionId(versionId);
      setEditorDirty(false);
    },
    [],
  );

  const toggleDocumentSelection = (documentId: string) => {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  };

  const selectAllDocuments = () => {
    setSelectedDocumentIds(documents.map((d) => d.id));
  };

  const clearSelectedDocuments = () => {
    setSelectedDocumentIds([]);
  };

  const selectedDocumentTitles = documents
    .filter((d) => selectedDocumentIds.includes(d.id))
    .map((d) => d.title);
  const documentTitleById = documents.reduce<Record<string, string>>((acc, d) => {
    acc[d.id] = d.title;
    return acc;
  }, {});

  const editorContent = activeVersion
    ? (activeVersion.richJson as Record<string, unknown>) ?? activeVersion.plainText ?? ""
    : "";

  const handleContentChange = useCallback((json: Record<string, unknown>) => {
    editorContentRef.current = json;
  }, []);

  const handleSaveVersion = useCallback(async () => {
    if (!activeDocumentId || !editorContentRef.current) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/documents/${activeDocumentId}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ richJson: editorContentRef.current }),
        },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "Save failed.");
      }
      setEditorDirty(false);
      router.refresh();
    } catch {
      // Could surface error in UI
    } finally {
      setIsSaving(false);
    }
  }, [activeDocumentId, projectId, router]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top header bar */}
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
              onClick={handleSaveVersion}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Save size={13} />
              {isSaving ? "Saving..." : "Save Version"}
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1 transition-all duration-200"
        style={{
          gridTemplateColumns: sidebarCollapsed
            ? "0px 1fr 380px"
            : "280px 1fr 380px",
        }}
      >
        {/* Left sidebar: documents + version timeline */}
        <aside
          className={`relative flex h-full flex-col border-r border-sidebar-border bg-sidebar overflow-hidden transition-all duration-200 ${
            sidebarCollapsed ? "w-0" : ""
          }`}
        >
          {!sidebarCollapsed && (
            <>
              <DocumentSidebar
                projectId={projectId}
                documents={documents}
                selectedDocumentIds={selectedDocumentIds}
                activeDocumentId={activeDocumentId}
                onToggleDocumentSelection={toggleDocumentSelection}
                onSelectDocument={handleSelectDocument}
                onSelectAllDocuments={selectAllDocuments}
                onClearSelectedDocuments={clearSelectedDocuments}
              />
              {activeDocument && (
                <VersionTimeline
                  documentTitle={activeDocument.title}
                  versions={activeDocument.versions}
                  activeVersionId={activeVersionId}
                  onSelectVersion={handleSelectVersion}
                />
              )}
            </>
          )}
        </aside>

        {/* Center: editor / compare */}
        <main className="flex min-h-0 flex-col bg-background">
          {/* Center view tabs */}
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            >
              {sidebarCollapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
            </button>

            <span className="mr-auto truncate text-xs font-medium text-foreground">
              {activeDocument?.title ?? projectName}
            </span>

            <div className="flex items-center gap-1">
              {([["editor", "Document", FileText], ["compare", "Compare", GitCompareArrows]] as const).map(
                ([view, label, Icon]) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setCenterView(view)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                      centerView === view
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ),
              )}
            </div>
          </div>

          {centerView === "editor" && (
            <div className="min-h-0 flex-1">
              <DocumentEditor
                content={
                  typeof editorContent === "string"
                    ? convertPlainTextToHtml(editorContent)
                    : editorContent
                }
                onDirtyChange={setEditorDirty}
                onContentChange={handleContentChange}
                editProposals={editProposals}
                activeDocumentId={activeDocumentId}
                projectId={projectId}
              />
            </div>
          )}

          {centerView === "compare" && (
            <div className="min-h-0 flex-1 overflow-y-auto bg-card p-4">
              <VersionHistoryCompare
                documents={documents.map((d) => ({
                  id: d.id,
                  title: d.title,
                  versions: d.versions,
                }))}
              />
            </div>
          )}

          {!activeDocument && centerView !== "compare" && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <FileText size={40} className="mx-auto text-muted-foreground/40" />
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  No document selected
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Select a document from the sidebar or upload a .docx file to begin.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar: chat */}
        <ChatPanel
          projectId={projectId}
          initialThreadId={threadId}
          initialMessages={initialMessages}
          mode={mode}
          onModeChange={setMode}
          selectedDocumentIds={selectedDocumentIds}
          selectedDocumentTitles={selectedDocumentTitles}
          documentTitleById={documentTitleById}
          onEditProposals={setEditProposals}
          editProposals={editProposals}
        />
      </div>
    </div>
  );
}

function convertPlainTextToHtml(text: string): string {
  if (!text.trim()) return "";
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .filter(Boolean)
    .join("");
}
