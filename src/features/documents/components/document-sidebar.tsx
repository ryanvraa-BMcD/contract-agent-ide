"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type SidebarDocument = {
  id: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  updatedAt: string;
  activeVersion: {
    versionNumber: number;
  } | null;
};

type DocumentSidebarProps = {
  projectId: string;
  documents: SidebarDocument[];
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentSidebar({ projectId, documents }: DocumentSidebarProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File)) {
      setError("Select a .docx file first.");
      return;
    }

    setUploading(true);
    try {
      const payload = new FormData();
      payload.append("file", file);

      const response = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        body: payload,
      });

      if (!response.ok) {
        const message = (await response.json()) as { error?: string };
        throw new Error(message.error || "Upload failed.");
      }

      event.currentTarget.reset();
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Project Documents</h2>
        <p className="mt-1 text-xs text-slate-600">Upload and track contract versions.</p>
        <form onSubmit={handleUpload} className="mt-3 space-y-2">
          <input
            name="file"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium"
          />
          <button
            type="submit"
            disabled={uploading}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Upload .docx"}
          </button>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {documents.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">
            No documents uploaded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((document) => (
              <li key={document.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="truncate text-sm font-medium text-slate-900">{document.title}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{document.originalFilename}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>v{document.activeVersion?.versionNumber ?? "?"}</span>
                  <span>{formatSize(document.sizeBytes)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
