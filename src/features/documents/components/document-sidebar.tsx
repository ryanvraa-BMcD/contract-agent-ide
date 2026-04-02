"use client";

import { useRouter } from "next/navigation";
import { useState, DragEvent } from "react";
import {
  Plus,
  FileText,
  Search,
  X,
  Download,
  Loader2,
} from "lucide-react";
import { DocumentUploadZone } from "./document-upload-zone";
import { DocumentListItem } from "./document-list-item";

type DocumentRole = "MAIN_AGREEMENT" | "EXHIBIT" | "REFERENCE";

type SidebarDocument = {
  id: string;
  title: string;
  role: DocumentRole;
  originalFilename: string;
  sizeBytes: number;
  sortOrder: number;
  updatedAt: string;
  activeVersion: { versionNumber: number } | null;
};

type DocumentSidebarProps = {
  projectId: string;
  documents: SidebarDocument[];
  selectedDocumentIds: string[];
  activeDocumentId: string | null;
  onToggleDocumentSelection: (documentId: string) => void;
  onSelectDocument: (documentId: string) => void;
  onSelectAllDocuments: () => void;
  onClearSelectedDocuments: () => void;
  onUploadSuccess?: () => void;
  onReorder?: (orders: { id: string; sortOrder: number }[]) => void;
};

const ROLE_META: Record<DocumentRole, { label: string; badge: string; color: string }> = {
  MAIN_AGREEMENT: { label: "Main Agreement", badge: "Agreement", color: "bg-primary/10 text-primary" },
  EXHIBIT: { label: "Exhibit", badge: "Exhibit", color: "bg-warning/10 text-warning" },
  REFERENCE: { label: "Reference", badge: "Reference", color: "bg-muted-foreground/10 text-muted-foreground" },
};

const ROLE_ORDER: DocumentRole[] = ["MAIN_AGREEMENT", "EXHIBIT", "REFERENCE"];

export function DocumentSidebar({
  projectId,
  documents,
  selectedDocumentIds,
  activeDocumentId,
  onToggleDocumentSelection,
  onSelectDocument,
  onSelectAllDocuments,
  onClearSelectedDocuments,
  onUploadSuccess,
  onReorder,
}: DocumentSidebarProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null);

  const selectedSet = new Set(selectedDocumentIds);
  const selectedCount = selectedDocumentIds.length;

  const filteredDocuments = searchQuery.trim()
    ? documents.filter((d) => d.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : documents;

  const handleDelete = async (documentId: string) => {
    setDeleting(documentId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/documents/${documentId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || "Delete failed.");
      }
      setConfirmDelete(null);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  const reorderGroup = (newOrder: SidebarDocument[]) => {
    if (!onReorder) return;
    onReorder(newOrder.map((d, i) => ({ id: d.id, sortOrder: i })));
  };

  const handleMoveUp = (doc: SidebarDocument, docsInGroup: SidebarDocument[]) => {
    const idx = docsInGroup.findIndex((d) => d.id === doc.id);
    if (idx <= 0) return;
    const newOrder = [...docsInGroup];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    reorderGroup(newOrder);
  };

  const handleMoveDown = (doc: SidebarDocument, docsInGroup: SidebarDocument[]) => {
    const idx = docsInGroup.findIndex((d) => d.id === doc.id);
    if (idx < 0 || idx >= docsInGroup.length - 1) return;
    const newOrder = [...docsInGroup];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    reorderGroup(newOrder);
  };

  const handleDocDragStart = (e: DragEvent, docId: string) => {
    setDraggedDocId(docId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", docId);
  };

  const handleDocDragOver = (e: DragEvent, docId: string) => {
    if (!draggedDocId || draggedDocId === docId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDocId(docId);
  };

  const handleDocDrop = (e: DragEvent, targetDoc: SidebarDocument, docsInGroup: SidebarDocument[]) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDocId(null);
    if (!draggedDocId || draggedDocId === targetDoc.id) {
      setDraggedDocId(null);
      return;
    }
    const fromIdx = docsInGroup.findIndex((d) => d.id === draggedDocId);
    const toIdx = docsInGroup.findIndex((d) => d.id === targetDoc.id);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedDocId(null);
      return;
    }
    const newOrder = [...docsInGroup];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    reorderGroup(newOrder);
    setDraggedDocId(null);
  };

  const handleDocDragEnd = () => {
    setDraggedDocId(null);
    setDragOverDocId(null);
  };

  const handleCompile = async () => {
    const compilableDocs = documents.filter(
      (d) => d.role === "MAIN_AGREEMENT" || d.role === "EXHIBIT",
    );
    if (compilableDocs.length === 0) return;

    setCompiling(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: compilableDocs.map((d) => d.id) }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || "Compilation failed.");
      }
      const result = (await response.json()) as { downloadUrl: string };
      const link = document.createElement("a");
      link.href = result.downloadUrl;
      link.download = "compiled-contract.docx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : "Compilation failed.");
    } finally {
      setCompiling(false);
    }
  };

  const compilableCount = documents.filter(
    (d) => d.role === "MAIN_AGREEMENT" || d.role === "EXHIBIT",
  ).length;

  const groupedDocuments = ROLE_ORDER.map((role) => ({
    role,
    meta: ROLE_META[role],
    docs: filteredDocuments.filter((d) => d.role === role),
  })).filter((group) => group.docs.length > 0);

  return (
    <DocumentUploadZone
      projectId={projectId}
      expanded={uploadExpanded}
      onUploadSuccess={() => {
        setUploadExpanded(false);
        onUploadSuccess?.();
      }}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-sidebar-border px-3 py-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Documents
          </h2>
          <div className="flex items-center gap-1">
            {compilableCount > 0 && (
              <button
                type="button"
                onClick={handleCompile}
                disabled={compiling}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:opacity-60"
                title="Compile & export all agreements and exhibits as one DOCX"
              >
                {compiling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                <span>{compiling ? "Compiling..." : "Compile"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setUploadExpanded(!uploadExpanded)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                uploadExpanded
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              }`}
              title="Upload document"
            >
              <Plus size={14} />
              <span>Upload</span>
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            Context:{" "}
            <span className="font-semibold text-foreground">{selectedCount}</span>
            /{documents.length}
          </span>
          <button type="button" onClick={onSelectAllDocuments} className="text-primary hover:underline">
            All
          </button>
          <button type="button" onClick={onClearSelectedDocuments} className="text-primary hover:underline">
            None
          </button>
        </div>
      </div>

      {/* Search */}
      {documents.length > 2 && (
        <div className="shrink-0 border-b border-sidebar-border px-3 py-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-card py-1.5 pl-7 pr-2 text-xs text-card-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Document list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {error && (
          <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            <X size={12} className="shrink-0" />
            {error}
          </div>
        )}
        {documents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card p-6 text-center">
            <FileText size={24} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
            <button
              type="button"
              onClick={() => setUploadExpanded(true)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Upload your first document
            </button>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No documents match &quot;{searchQuery}&quot;
          </p>
        ) : (
          <div className="space-y-3">
            {groupedDocuments.map(({ role, meta, docs }) => (
              <section key={role}>
                <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${meta.color}`}>
                    {meta.badge}
                  </span>
                  <span>{docs.length}</span>
                </h3>
                <ul className="space-y-0.5">
                  {docs.map((doc, docIndex) => (
                    <DocumentListItem
                      key={doc.id}
                      doc={doc}
                      isActive={doc.id === activeDocumentId}
                      isInContext={selectedSet.has(doc.id)}
                      isFirst={docIndex === 0}
                      isLast={docIndex === docs.length - 1}
                      canReorder={docs.length > 1 && !!onReorder}
                      confirmDelete={confirmDelete}
                      deleting={deleting}
                      dragOverDocId={dragOverDocId}
                      draggedDocId={draggedDocId}
                      onSelect={onSelectDocument}
                      onToggleContext={onToggleDocumentSelection}
                      onMoveUp={() => handleMoveUp(doc, docs)}
                      onMoveDown={() => handleMoveDown(doc, docs)}
                      onConfirmDelete={setConfirmDelete}
                      onDelete={handleDelete}
                      onDocDragStart={handleDocDragStart}
                      onDocDragOver={handleDocDragOver}
                      onDocDrop={(e) => handleDocDrop(e, doc, docs)}
                      onDocDragEnd={handleDocDragEnd}
                      onDragLeave={() => {
                        if (dragOverDocId === doc.id) setDragOverDocId(null);
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </DocumentUploadZone>
  );
}
