"use client";

import { FormEvent, useState } from "react";
import type { WorkspaceMode } from "@/src/lib/validation";

type UiMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
};

type ChatPanelProps = {
  projectId: string;
  initialThreadId: string | null;
  initialMessages: UiMessage[];
  mode: WorkspaceMode;
  selectedDocumentIds: string[];
  selectedDocumentTitles: string[];
};

type ChatResponse = {
  threadId: string;
  userMessage: UiMessage;
  assistantMessage: UiMessage;
  agentRunId: string;
};

export function ChatPanel({
  projectId,
  initialThreadId,
  initialMessages,
  mode,
  selectedDocumentIds,
  selectedDocumentTitles,
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
      setMessages((current) => [...current, payload.userMessage, payload.assistantMessage]);
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
