"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  FileText,
  GitCompareArrows,
  Eye,
  Save,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  Zap,
  X,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { ChatPanel } from "@/src/features/chat/components/chat-panel";
import { VersionHistoryCompare } from "@/src/features/compare/components/version-history-compare";
import { DocumentSidebar } from "@/src/features/documents/components/document-sidebar";
import { VersionTimeline } from "@/src/features/documents/components/version-timeline";
import { DocumentEditor } from "@/src/features/editor/components/document-editor";
import { DocumentPreview } from "@/src/features/editor/components/document-preview";
import { ThemeToggle } from "@/src/features/workspace/components/theme-toggle";
import { FormatSettingsDialog } from "@/src/features/workspace/components/format-settings-dialog";
import type { ReviewProposal } from "@/src/features/review/types";
import type { WorkspaceMode } from "@/src/lib/validation";
import type { ProjectStyleSettings } from "@/src/types/style-settings";

type WorkspaceDocument = {
  id: string;
  title: string;
  role: "MAIN_AGREEMENT" | "EXHIBIT" | "REFERENCE";
  originalFilename: string;
  originalMimeType: string;
  sizeBytes: number;
  sortOrder: number;
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
  styleSettings: ProjectStyleSettings;
  documents: WorkspaceDocument[];
  threadId: string | null;
  initialMessages: WorkspaceMessage[];
};

type CenterView = "editor" | "compare" | "preview";

export function WorkspaceLayout({
  projectId,
  projectName,
  styleSettings,
  documents,
  threadId,
  initialMessages,
}: WorkspaceLayoutProps) {
  const [mode, setMode] = useState<WorkspaceMode>("Ask");
  const [pendingProposals, setPendingProposals] = useState<ReviewProposal[]>([]);
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
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(380);
  const [timelineHeight, setTimelineHeight] = useState(200);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [formatSettingsOpen, setFormatSettingsOpen] = useState(false);
  const editorContentRef = useRef<Record<string, unknown> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveVersionRef = useRef<() => Promise<void>>(async () => {});
  const router = useRouter();

  const startResizeLeft = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(480, Math.max(200, startWidth + ev.clientX - startX));
      setLeftWidth(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [leftWidth]);

  const startResizeRight = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;
    const onMove = (ev: MouseEvent) => {
      // Right sidebar grows leftward, so delta is inverted.
      const next = Math.min(600, Math.max(280, startWidth - (ev.clientX - startX)));
      setRightWidth(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [rightWidth]);

  const startResizeTimeline = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = timelineHeight;
    const onMove = (ev: MouseEvent) => {
      // Dragging up increases timeline height (delta is inverted).
      const next = Math.min(500, Math.max(80, startHeight - (ev.clientY - startY)));
      setTimelineHeight(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [timelineHeight]);

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

  const handleReorder = useCallback(
    async (orders: { id: string; sortOrder: number }[]) => {
      try {
        await fetch(`/api/projects/${projectId}/documents/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders }),
        });
        router.refresh();
      } catch {
        // silently fail — refresh will restore correct state
      }
    },
    [projectId, router],
  );

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

  useEffect(() => {
    handleSaveVersionRef.current = handleSaveVersion;
  }, [handleSaveVersion]);

  const handleContentChange = useCallback((json: Record<string, unknown>) => {
    editorContentRef.current = json;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      handleSaveVersionRef.current();
    }, 5000);
  }, []);

  useEffect(() => {
    if (!editorDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editorDirty]);

  const incorporateProposals = useCallback(() => {
    setEditProposals(pendingProposals);
    setPendingProposals([]);
  }, [pendingProposals]);

  const dismissProposals = useCallback(() => {
    setPendingProposals([]);
  }, []);

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
          <button
            type="button"
            onClick={() => setFormatSettingsOpen(true)}
            title="Format Settings"
            className="flex items-center gap-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings2 size={15} />
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: sidebarCollapsed
            ? `0px 1fr ${rightWidth}px`
            : `${leftWidth}px 1fr ${rightWidth}px`,
        }}
      >
        {/* Left sidebar: documents + version timeline */}
        <aside
          className={`relative flex h-full flex-col border-r border-sidebar-border bg-sidebar overflow-hidden ${
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
                onReorder={handleReorder}
              />
              {activeDocument && (
                <>
                  {/* Vertical resize handle — only shown when timeline is expanded */}
                  {!timelineCollapsed && (
                    <div
                      onMouseDown={startResizeTimeline}
                      className="h-1 w-full shrink-0 cursor-row-resize transition-colors hover:bg-primary/40 active:bg-primary/60"
                      title="Drag to resize"
                    />
                  )}
                  <div
                    className="shrink-0 overflow-hidden"
                    style={{ height: timelineCollapsed ? "auto" : timelineHeight }}
                  >
                    <VersionTimeline
                      documentTitle={activeDocument.title}
                      versions={activeDocument.versions}
                      activeVersionId={activeVersionId}
                      onSelectVersion={handleSelectVersion}
                      collapsed={timelineCollapsed}
                      onCollapsedChange={setTimelineCollapsed}
                    />
                  </div>
                </>
              )}
              {/* Left resize handle */}
              <div
                onMouseDown={startResizeLeft}
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
                title="Drag to resize"
              />
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
              {([["editor", "Document", FileText], ["compare", "Compare", GitCompareArrows], ["preview", "Preview", Eye]] as const).map(
                ([view, label, Icon]) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setCenterView(view)}
                    disabled={view === "preview" && !activeDocumentId}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                      centerView === view
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ),
              )}
            </div>
          </div>

          {pendingProposals.length > 0 && (
            <div className="flex shrink-0 items-center gap-3 border-b border-border bg-accent px-4 py-2.5">
              <Zap size={14} className="shrink-0 text-accent-foreground" />
              <span className="text-xs font-medium text-accent-foreground">
                {pendingProposals.length} edit{" "}
                {pendingProposals.length === 1 ? "proposal" : "proposals"} ready
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={incorporateProposals}
                  className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Incorporate Changes
                </button>
                <button
                  type="button"
                  onClick={dismissProposals}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Dismiss proposals"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

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
                styleSettings={styleSettings}
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

          {centerView === "preview" && activeDocument && (
            <div className="min-h-0 flex-1">
              <DocumentPreview
                projectId={projectId}
                documentId={activeDocument.id}
                mimeType={activeDocument.originalMimeType}
                title={activeDocument.title}
                isInContext={selectedDocumentIds.includes(activeDocument.id)}
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
        <div className="relative flex min-h-0 flex-col border-l border-sidebar-border">
          {/* Right resize handle — sits on the left edge of the chat panel */}
          <div
            onMouseDown={startResizeRight}
            className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors z-10"
            title="Drag to resize"
          />
          <ChatPanel
            projectId={projectId}
            initialThreadId={threadId}
            initialMessages={initialMessages}
            mode={mode}
            onModeChange={setMode}
            selectedDocumentIds={selectedDocumentIds}
            selectedDocumentTitles={selectedDocumentTitles}
            documentTitleById={documentTitleById}
            onEditProposals={setPendingProposals}
            editProposals={editProposals}
          />
        </div>
      </div>

      <FormatSettingsDialog
        open={formatSettingsOpen}
        onClose={() => setFormatSettingsOpen(false)}
        projectId={projectId}
        documents={documents.map((d) => ({
          id: d.id,
          title: d.title,
          originalMimeType: d.originalMimeType,
        }))}
        initialSettings={styleSettings}
        onSaved={() => router.refresh()}
      />
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
