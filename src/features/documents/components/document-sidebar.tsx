"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useRef, DragEvent } from "react";
import {
  Plus,
  Upload,
  FileText,
  Trash2,
  Check,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  GripVertical,
} from "lucide-react";

type DocumentRole = "MAIN_AGREEMENT" | "EXHIBIT" | "REFERENCE";

type SidebarDocument = {
  id: string;
  title: string;
  role: DocumentRole;
  originalFilename: string;
  sizeBytes: number;
  sortOrder: number;
  updatedAt: string;
  activeVersion: {
    versionNumber: number;
  } | null;
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

const ROLE_META: Record<
  DocumentRole,
  { label: string; badge: string; color: string }
> = {
  MAIN_AGREEMENT: {
    label: "Main Agreement",
    badge: "Agreement",
    color: "bg-primary/10 text-primary",
  },
  EXHIBIT: {
    label: "Exhibit",
    badge: "Exhibit",
    color: "bg-warning/10 text-warning",
  },
  REFERENCE: {
    label: "Reference",
    badge: "Reference",
    color: "bg-muted-foreground/10 text-muted-foreground",
  },
};

const ROLE_ORDER: DocumentRole[] = ["MAIN_AGREEMENT", "EXHIBIT", "REFERENCE"];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadRole, setUploadRole] = useState<DocumentRole>("MAIN_AGREEMENT");
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const droppedFileRef = useRef<File | null>(null);
  const dragCounterRef = useRef(0);

  const selectedSet = new Set(selectedDocumentIds);
  const selectedCount = selectedDocumentIds.length;

  const filteredDocuments = searchQuery.trim()
    ? documents.filter((d) =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : documents;

  const uploadFile = async (file: File, role: DocumentRole) => {
    const lower = file.name.toLowerCase();
    const isSupported =
      lower.endsWith(".docx") ||
      lower.endsWith(".doc") ||
      lower.endsWith(".pdf") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.type === "application/msword" ||
      file.type === "application/pdf";
    if (!isSupported) {
      setError("Only .doc, .docx, and .pdf files are supported.");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setError(null);

    const progressInterval = setInterval(() => {
      setUploadProgress((p) => Math.min(p + 15, 90));
    }, 300);

    try {
      const payload = new FormData();
      payload.append("file", file);
      payload.append("role", role);

      const response = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        body: payload,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const message = (await response.json()) as { error?: string };
        throw new Error(message.error || "Upload failed.");
      }

      onUploadSuccess?.();
      setUploadExpanded(false);
      setSelectedFileName(null);
      droppedFileRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (uploadError) {
      clearInterval(progressInterval);
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed.",
      );
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = droppedFileRef.current ?? (new FormData(form).get("file") as File | null);
    if (!(file instanceof File) || !file.name) {
      setError("Select a file first.");
      return;
    }
    await uploadFile(file, uploadRole);
    droppedFileRef.current = null;
    setSelectedFileName(null);
    form.reset();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    if (isPdf) setUploadRole("REFERENCE");
  };

  const handleDragEnter = (e: DragEvent) => {
    // Only activate the file-upload overlay for actual file drags, not
    // the internal document reorder drags.
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const supportedFile = files.find((f) => {
      const n = f.name.toLowerCase();
      return n.endsWith(".docx") || n.endsWith(".doc") || n.endsWith(".pdf");
    });
    if (supportedFile) {
      const isPdf = supportedFile.name.toLowerCase().endsWith(".pdf") || supportedFile.type === "application/pdf";
      if (isPdf) setUploadRole("REFERENCE");
      droppedFileRef.current = supportedFile;
      setSelectedFileName(supportedFile.name);
      setUploadExpanded(true);
    } else {
      setError("Only .doc, .docx, and .pdf files are supported.");
    }
  };

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
      setError(
        deleteError instanceof Error ? deleteError.message : "Delete failed.",
      );
    } finally {
      setDeleting(null);
    }
  };

  // Reorders by assigning fresh sequential sortOrders (0, 1, 2...) to the
  // full group after the move. This avoids the "all docs have sortOrder 0"
  // problem where swapping equal values has no effect.
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
    // Use a plain text payload so the file-upload handlers can distinguish
    // this from a real file drag via types.includes("Files").
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
      setError(
        compileError instanceof Error ? compileError.message : "Compilation failed.",
      );
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
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
          <button
            type="button"
            onClick={onSelectAllDocuments}
            className="text-primary hover:underline"
          >
            All
          </button>
          <button
            type="button"
            onClick={onClearSelectedDocuments}
            className="text-primary hover:underline"
          >
            None
          </button>
        </div>
      </div>

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm">
          <div className="text-center">
            <Upload size={32} className="mx-auto text-primary" />
            <p className="mt-2 text-sm font-medium text-primary">
              Drop file to upload
            </p>
          </div>
        </div>
      )}

      {/* Upload form (collapsible) */}
      {uploadExpanded && (
        <div className="shrink-0 border-b border-sidebar-border bg-card px-3 py-3">
          <form onSubmit={handleUpload} className="space-y-2.5">
            <div
              className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-border p-4 text-center transition-colors hover:border-primary hover:bg-accent"
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
            >
              <Upload size={20} className="text-muted-foreground" />
              {selectedFileName ? (
                <p className="truncate text-xs font-medium text-foreground">
                  {selectedFileName}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Click or drag a <span className="font-semibold">.docx</span> or <span className="font-semibold">.pdf</span> file
                </p>
              )}
              <input
                ref={fileInputRef}
                name="file"
                type="file"
                accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={uploadRole}
                onChange={(e) => setUploadRole(e.target.value as DocumentRole)}
                className="flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-xs text-card-foreground outline-none focus:ring-1 focus:ring-ring"
              >
                {ROLE_ORDER.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_META[role].label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="pointer-events-none -ml-6 text-muted-foreground" />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Upload size={14} />
              {uploading ? "Uploading..." : "Upload Document"}
            </button>
            {uploading && (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
            {error && (
              <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                <X size={12} className="shrink-0" />
                {error}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Search */}
      {documents.length > 2 && (
        <div className="shrink-0 border-b border-sidebar-border px-3 py-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
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
        {documents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card p-6 text-center">
            <FileText size={24} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              No documents uploaded yet.
            </p>
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
                  {docs.map((doc, docIndex) => {
                    const isActive = doc.id === activeDocumentId;
                    const isInContext = selectedSet.has(doc.id);
                    const isConfirming = confirmDelete === doc.id;
                    const isFirst = docIndex === 0;
                    const isLast = docIndex === docs.length - 1;
                    const isDragTarget = dragOverDocId === doc.id && draggedDocId !== doc.id;
                    const isDraggingThis = draggedDocId === doc.id;
                    return (
                      <li
                        key={doc.id}
                        className={`group relative transition-opacity ${isDraggingThis ? "opacity-40" : ""}`}
                        onDragOver={(e) => handleDocDragOver(e, doc.id)}
                        onDrop={(e) => handleDocDrop(e, doc, docs)}
                        onDragLeave={() => {
                          if (dragOverDocId === doc.id) setDragOverDocId(null);
                        }}
                      >
                        {/* Drop indicator line */}
                        {isDragTarget && (
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-full bg-primary" />
                        )}
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2">
                            <p className="flex-1 text-xs text-destructive">Delete this document?</p>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc.id)}
                              disabled={deleting === doc.id}
                              className="rounded bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
                            >
                              {deleting === doc.id ? "..." : "Delete"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-border"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            {/* Grip handle — only shown when reorder is available */}
                            {docs.length > 1 && onReorder && (
                              <div
                                draggable
                                onDragStart={(e) => handleDocDragStart(e, doc.id)}
                                onDragEnd={handleDocDragEnd}
                                className="flex shrink-0 cursor-grab items-center pl-1 pr-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                                title="Drag to reorder"
                              >
                                <GripVertical size={13} />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectDocument(doc.id)}
                              className={`min-w-0 flex-1 rounded-md py-2 text-left transition-colors ${
                                docs.length > 1 && onReorder ? "pl-1 pr-2.5" : "px-2.5"
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
                                    onToggleDocumentSelection(doc.id);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === " " || e.key === "Enter") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onToggleDocumentSelection(doc.id);
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
                            {docs.length > 1 && onReorder && (
                              <>
                                <button
                                  type="button"
                                  disabled={isFirst}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveUp(doc, docs);
                                  }}
                                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                                  title="Move up"
                                >
                                  <ChevronUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  disabled={isLast}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveDown(doc, docs);
                                  }}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(doc.id);
                              }}
                              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title="Remove document"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
