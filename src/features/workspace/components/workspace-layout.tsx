"use client";

import { useState } from "react";
import { ChatPanel } from "@/src/features/chat/components/chat-panel";
import { DocumentSidebar } from "@/src/features/documents/components/document-sidebar";
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
};

type WorkspaceMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
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

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <ModeToolbar mode={mode} onModeChange={setMode} />
      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_380px]">
        <DocumentSidebar projectId={projectId} documents={documents} />
        <main className="min-h-0 overflow-y-auto bg-white p-6">
          <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <h1 className="text-xl font-semibold text-slate-900">{projectName}</h1>
              <p className="mt-1 text-sm text-slate-600">
                Document viewer/editor placeholder. Connect document selection and rich editor in a
                follow-up iteration.
              </p>
            </div>
            <div className="p-5">
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                Center pane placeholder for legal document rendering, clause navigation, diff
                compare mode, and inline edit proposals.
              </div>
            </div>
          </div>
        </main>
        <ChatPanel
          projectId={projectId}
          initialThreadId={threadId}
          initialMessages={initialMessages}
          mode={mode}
        />
      </div>
    </div>
  );
}
