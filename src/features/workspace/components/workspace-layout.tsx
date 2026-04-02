"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { ChatPanel } from "@/src/features/chat/components/chat-panel";
import { VersionHistoryCompare } from "@/src/features/compare/components/version-history-compare";
import { DocumentSidebar } from "@/src/features/documents/components/document-sidebar";
import { VersionTimeline } from "@/src/features/documents/components/version-timeline";
import { DocumentEditor } from "@/src/features/editor/components/document-editor";
import { DocumentPreview } from "@/src/features/editor/components/document-preview";
import { FormatSettingsDialog } from "@/src/features/workspace/components/format-settings-dialog";
import { WorkspaceHeader } from "@/src/features/workspace/components/workspace-header";
import { CenterViewTabs, type CenterView } from "@/src/features/workspace/components/center-view-tabs";
import { ProposalBanner } from "@/src/features/workspace/components/proposal-banner";
import { useToast } from "@/src/features/workspace/components/toast";
import { usePanelResize } from "@/src/features/workspace/hooks/use-panel-resize";
import type { ReviewProposal } from "@/src/features/review/types";
import type { WorkspaceMode } from "@/src/lib/validation";
import type { ProjectStyleSettings } from "@/src/types/style-settings";
import type { WorkspaceDocument, WorkspaceMessage } from "@/src/types/workspace";

type WorkspaceLayoutProps = {
  projectId: string;
  projectName: string;
  styleSettings: ProjectStyleSettings;
  documents: WorkspaceDocument[];
  threadId: string | null;
  initialMessages: WorkspaceMessage[];
};

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
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [formatSettingsOpen, setFormatSettingsOpen] = useState(false);
  const editorContentRef = useRef<Record<string, unknown> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveVersionRef = useRef<() => Promise<void>>(async () => {});
  const router = useRouter();
  const { toast } = useToast();

  const left = usePanelResize(280, 200, 480);
  const right = usePanelResize(380, 280, 600, "horizontal", true);
  const timeline = usePanelResize(200, 80, 500, "vertical", true);

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

  const handleSelectVersion = useCallback((versionId: string) => {
    setActiveVersionId(versionId);
    setEditorDirty(false);
  }, []);

  const toggleDocumentSelection = (documentId: string) => {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  };

  const selectAllDocuments = () => setSelectedDocumentIds(documents.map((d) => d.id));
  const clearSelectedDocuments = () => setSelectedDocumentIds([]);

  const handleReorder = useCallback(
    async (orders: { id: string; sortOrder: number }[]) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/documents/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders }),
        });
        if (!res.ok) throw new Error("Reorder failed.");
        router.refresh();
      } catch {
        toast("Failed to reorder documents.", "error");
        router.refresh();
      }
    },
    [projectId, router, toast],
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
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Failed to save version.",
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  }, [activeDocumentId, projectId, router, toast]);

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

  const handleProposalAccepted = useCallback((proposalId: string) => {
    setEditProposals((prev) => prev.filter((p) => p.title !== proposalId));
  }, []);

  const handleProposalRejected = useCallback((proposalId: string) => {
    setEditProposals((prev) => prev.filter((p) => p.title !== proposalId));
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background">
      <WorkspaceHeader
        projectName={projectName}
        editorDirty={editorDirty}
        isSaving={isSaving}
        onSave={handleSaveVersion}
        onOpenSettings={() => setFormatSettingsOpen(true)}
      />

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: sidebarCollapsed
            ? `0px 1fr ${right.size}px`
            : `${left.size}px 1fr ${right.size}px`,
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
                  {!timelineCollapsed && (
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      onMouseDown={timeline.startResize}
                      className="h-1 w-full shrink-0 cursor-row-resize transition-colors hover:bg-primary/40 active:bg-primary/60"
                      title="Drag to resize"
                    />
                  )}
                  <div
                    className="shrink-0 overflow-hidden"
                    style={{ height: timelineCollapsed ? "auto" : timeline.size }}
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
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={left.startResize}
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
                title="Drag to resize"
              />
            </>
          )}
        </aside>

        {/* Center: editor / compare / preview */}
        <main className="flex min-h-0 flex-col bg-background">
          <CenterViewTabs
            activeDocumentTitle={activeDocument?.title ?? null}
            projectName={projectName}
            centerView={centerView}
            onCenterViewChange={setCenterView}
            sidebarCollapsed={sidebarCollapsed}
            onSidebarCollapsedChange={setSidebarCollapsed}
            hasActiveDocument={!!activeDocumentId}
          />

          <ProposalBanner
            count={pendingProposals.length}
            onIncorporate={incorporateProposals}
            onDismiss={dismissProposals}
          />

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
                onProposalAccepted={handleProposalAccepted}
                onProposalRejected={handleProposalRejected}
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
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={right.startResize}
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
