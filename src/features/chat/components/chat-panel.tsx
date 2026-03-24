"use client";

import { FormEvent, useState } from "react";
import type { ReviewProposal } from "@/src/features/review/types";
import type { WorkspaceMode } from "@/src/lib/validation";

type UiCitation = {
  documentId: string;
  versionId: string;
  chunkId: string;
  snippet: string;
};

type UiMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
  citations?: UiCitation[];
};

type ChatPanelProps = {
  projectId: string;
  initialThreadId: string | null;
  initialMessages: UiMessage[];
  mode: WorkspaceMode;
  selectedDocumentIds: string[];
  selectedDocumentTitles: string[];
  documentTitleById: Record<string, string>;
  onEditProposals: (proposals: ReviewProposal[]) => void;
};

type ChatResponse = {
  threadId: string;
  userMessage: UiMessage;
  assistantMessage: UiMessage;
  agentRunId: string;
  citations?: UiCitation[];
  edit?: {
    proposals: ReviewProposal[];
  };
};

function normalizeCitations(value: unknown): UiCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => {
      if (!item || typeof item !== "object") return false;
      const citation = item as Record<string, unknown>;
      return (
        typeof citation.documentId === "string" &&
        typeof citation.versionId === "string" &&
        typeof citation.chunkId === "string" &&
        typeof citation.snippet === "string"
      );
    })
    .map((item) => item as UiCitation);
}

export function ChatPanel({
  projectId,
  initialThreadId,
  initialMessages,
  mode,
  selectedDocumentIds,
  selectedDocumentTitles,
  documentTitleById,
  onEditProposals,
}: ChatPanelProps) {
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [pendingText, setPendingText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = pendingText.trim();
    if (!content) return;

    setIsSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          mode,
          threadId: threadId ?? undefined,
          selectedDocumentIds,
        }),
      });

      if (!response.ok) {
        const failure = (await response.json()) as { error?: string };
        throw new Error(failure.error || "Failed to send chat message.");
      }

      const payload = (await response.json()) as ChatResponse;
      setThreadId(payload.threadId);
      const assistantWithCitations: UiMessage = {
        ...payload.assistantMessage,
        citations: normalizeCitations(payload.citations ?? payload.assistantMessage.citations),
      };
      setMessages((current) => [...current, payload.userMessage, assistantWithCitations]);
      if (payload.edit?.proposals) {
        onEditProposals(payload.edit.proposals);
      }
      setPendingText("");
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Failed to send chat message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="flex h-full flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Agent Chat</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>
            Mode: <span className="font-medium text-slate-700">{mode}</span>
          </span>
          <span className="text-slate-300">|</span>
          <span>
            Context docs:{" "}
            <span className="font-medium text-slate-700">{selectedDocumentIds.length}</span>
          </span>
        </div>
        {selectedDocumentTitles.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {selectedDocumentTitles.map((title) => (
              <span
                key={title}
                className="max-w-[180px] truncate rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                title={title}
              >
                {title}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-amber-700">No documents selected for context.</p>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
            Start a conversation to generate analysis or edits.
          </p>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                message.role === "USER" ? "bg-blue-50 text-blue-950" : "bg-slate-100 text-slate-900"
              }`}
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {message.role.toLowerCase()}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === "ASSISTANT" && (mode === "Ask" || (message.citations?.length ?? 0) > 0) ? (
                <div className="mt-3">
                  {message.citations && message.citations.length > 0 ? (
                    <div className="space-y-2 border-t border-slate-300/70 pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Citations
                      </p>
                      {message.citations.map((citation) => (
                        <div
                          key={`${message.id}-${citation.chunkId}`}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                        >
                          <p className="truncate font-medium text-slate-800">
                            {documentTitleById[citation.documentId] || citation.documentId}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            chunk {citation.chunkId.slice(0, 8)} | version{" "}
                            {citation.versionId.slice(0, 8)}
                          </p>
                          <p className="mt-1 line-clamp-3 text-[11px] italic text-slate-600">
                            "{citation.snippet}"
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-500">No citations available.</p>
                  )}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      <form onSubmit={submitMessage} className="border-t border-slate-200 p-3">
        <textarea
          value={pendingText}
          onChange={(event) => setPendingText(event.target.value)}
          placeholder="Ask the agent about this contract..."
          rows={4}
          className="w-full resize-none rounded-md border border-slate-300 p-2 text-sm text-slate-900 outline-none ring-blue-500 placeholder:text-slate-400 focus:ring-2"
        />
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={isSending}
          className="mt-2 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? "Sending..." : "Send message"}
        </button>
      </form>
    </section>
  );
}
