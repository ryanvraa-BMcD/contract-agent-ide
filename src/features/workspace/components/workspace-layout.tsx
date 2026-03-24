"use client";

import { useState } from "react";
import { ChatPanel } from "@/src/features/chat/components/chat-panel";
import { VersionHistoryCompare } from "@/src/features/compare/components/version-history-compare";
import { DocumentSidebar } from "@/src/features/documents/components/document-sidebar";
import { ReviewPanel } from "@/src/features/review/components/review-panel";
import type { ReviewProposal } from "@/src/features/review/types";
import { ModeToolbar } from "@/src/features/workspace/components/mode-toolbar";
import type { WorkspaceMode } from "@/src/lib/validation";

type WorkspaceDocument = {
  id: string;
  title: string;
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
    documents.map((document) => document.id)
  );

  const toggleDocumentSelection = (documentId: string) => {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    );
  };

  const selectAllDocuments = () => {
    setSelectedDocumentIds(documents.map((document) => document.id));
  };

  const clearSelectedDocuments = () => {
    setSelectedDocumentIds([]);
  };

  const selectedDocumentTitles = documents
    .filter((document) => selectedDocumentIds.includes(document.id))
    .map((document) => document.title);
  const documentTitleById = documents.reduce<Record<string, string>>((acc, document) => {
    acc[document.id] = document.title;
    return acc;
  }, {});

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <ModeToolbar mode={mode} onModeChange={setMode} />
      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_380px]">
        <DocumentSidebar
          projectId={projectId}
          documents={documents}
          selectedDocumentIds={selectedDocumentIds}
          onToggleDocumentSelection={toggleDocumentSelection}
          onSelectAllDocuments={selectAllDocuments}
          onClearSelectedDocuments={clearSelectedDocuments}
        />
        <main className="min-h-0 overflow-y-auto bg-white p-6">
          <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <h1 className="text-xl font-semibold text-slate-900">{projectName}</h1>
              <p className="mt-1 text-sm text-slate-600">
                Document review workspace with version history and comparison tools.
              </p>
            </div>
            <div className="p-5">
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                Compare selected document versions below. Focus is on clarity and lineage for
                legal review workflows.
              </div>
            </div>
          </div>
          <VersionHistoryCompare
            documents={documents.map((document) => ({
              id: document.id,
              title: document.title,
              versions: document.versions,
            }))}
          />
          <ReviewPanel proposals={editProposals} documentTitleById={documentTitleById} />
        </main>
        <ChatPanel
          projectId={projectId}
          initialThreadId={threadId}
          initialMessages={initialMessages}
          mode={mode}
          selectedDocumentIds={selectedDocumentIds}
          selectedDocumentTitles={selectedDocumentTitles}
          documentTitleById={documentTitleById}
          onEditProposals={setEditProposals}
        />
      </div>
    </div>
  );
}
