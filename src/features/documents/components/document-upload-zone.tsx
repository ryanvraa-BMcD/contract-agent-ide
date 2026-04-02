"use client";

import { FormEvent, useState, useRef, DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, ChevronDown } from "lucide-react";

type DocumentRole = "MAIN_AGREEMENT" | "EXHIBIT" | "REFERENCE";

const ROLE_ORDER: DocumentRole[] = ["MAIN_AGREEMENT", "EXHIBIT", "REFERENCE"];
const ROLE_LABELS: Record<DocumentRole, string> = {
  MAIN_AGREEMENT: "Main Agreement",
  EXHIBIT: "Exhibit",
  REFERENCE: "Reference",
};

type DocumentUploadZoneProps = {
  projectId: string;
  expanded: boolean;
  onUploadSuccess?: () => void;
  children: ReactNode;
};

export function DocumentUploadZone({
  projectId,
  expanded,
  onUploadSuccess,
  children,
}: DocumentUploadZoneProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadRole, setUploadRole] = useState<DocumentRole>("MAIN_AGREEMENT");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const droppedFileRef = useRef<File | null>(null);
  const dragCounterRef = useRef(0);

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
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragging(true);
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

  const handleDrop = (e: DragEvent) => {
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
    } else {
      setError("Only .doc, .docx, and .pdf files are supported.");
    }
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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

      {expanded && (
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
                    {ROLE_LABELS[role]}
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

      {children}
    </div>
  );
}
