"use client";

import { useState, useCallback, FormEvent } from "react";
import type { ReviewProposal } from "@/src/features/review/types";
import type { WorkspaceMode } from "@/src/lib/validation";
import type { UiCitation, WorkspaceMessage } from "@/src/types/workspace";
import { normalizeCitations } from "@/src/types/workspace";

type ChatResponse = {
  threadId: string;
  userMessage: WorkspaceMessage;
  assistantMessage: WorkspaceMessage;
  agentRunId: string;
  citations?: UiCitation[];
  edit?: { proposals: ReviewProposal[] };
};

type StreamEvent = {
  type: "token" | "done" | "error" | "thinking" | "status";
  token?: string;
  text?: string;
  message?: WorkspaceMessage;
  citations?: UiCitation[];
  threadId?: string;
  edit?: { proposals: ReviewProposal[] };
  error?: string;
};

type UseSSEChatOptions = {
  projectId: string;
  initialThreadId: string | null;
  initialMessages: WorkspaceMessage[];
  onEditProposals: (proposals: ReviewProposal[]) => void;
};

export function useSSEChat({
  projectId,
  initialThreadId,
  initialMessages,
  onEditProposals,
}: UseSSEChatOptions) {
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<WorkspaceMessage[]>(initialMessages);
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const resetChat = useCallback(() => {
    if (isSending || isStreaming) return;
    setThreadId(null);
    setMessages([]);
    setStreamingContent("");
    setStatusText(null);
    setError(null);
  }, [isSending, isStreaming]);

  const sendMessage = useCallback(
    async (
      content: string,
      mode: WorkspaceMode,
      selectedDocumentIds: string[],
      event?: FormEvent<HTMLFormElement>,
    ) => {
      event?.preventDefault();
      const trimmed = content.trim();
      if (!trimmed || isSending) return;

      setIsSending(true);
      setError(null);

      const optimisticUser: WorkspaceMessage = {
        id: `temp-${Date.now()}`,
        role: "USER",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);

      try {
        const useSSE = mode === "Ask" || mode === "Plan" || mode === "Edit";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (useSSE) headers["Accept"] = "text/event-stream";

        const response = await fetch(`/api/projects/${projectId}/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            content: trimmed,
            mode,
            threadId: threadId ?? undefined,
            selectedDocumentIds,
          }),
        });

        if (!response.ok) {
          const failure = (await response.json()) as { error?: string };
          throw new Error(failure.error || "Failed to send chat message.");
        }

        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("text/event-stream")) {
          await processSSEStream(
            response,
            optimisticUser,
            onEditProposals,
            setThreadId,
            setMessages,
            setIsStreaming,
            setStreamingContent,
            setStatusText,
            setError,
          );
        } else {
          const payload = (await response.json()) as ChatResponse;
          setThreadId(payload.threadId);
          const assistantWithCitations: WorkspaceMessage = {
            ...payload.assistantMessage,
            citations: normalizeCitations(
              payload.citations ?? payload.assistantMessage.citations,
            ),
          };
          setMessages((prev) => {
            const withoutOptimistic = prev.filter((m) => m.id !== optimisticUser.id);
            return [...withoutOptimistic, payload.userMessage, assistantWithCitations];
          });
          if (payload.edit?.proposals) {
            onEditProposals(payload.edit.proposals);
          }
        }
      } catch (chatError) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
        setError(
          chatError instanceof Error
            ? chatError.message
            : "Failed to send chat message.",
        );
        setIsStreaming(false);
        setStreamingContent("");
      } finally {
        setIsSending(false);
      }
    },
    [isSending, projectId, threadId, onEditProposals],
  );

  return {
    threadId,
    messages,
    isSending,
    isStreaming,
    streamingContent,
    error,
    statusText,
    sendMessage,
    resetChat,
  };
}

async function processSSEStream(
  response: Response,
  optimisticUser: WorkspaceMessage,
  onEditProposals: (proposals: ReviewProposal[]) => void,
  setThreadId: (id: string) => void,
  setMessages: React.Dispatch<React.SetStateAction<WorkspaceMessage[]>>,
  setIsStreaming: (v: boolean) => void,
  setStreamingContent: (v: string) => void,
  setStatusText: (v: string | null) => void,
  setError: (v: string | null) => void,
) {
  setIsStreaming(true);
  setStreamingContent("");
  setStatusText(null);

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const event: StreamEvent = JSON.parse(data);

          if (event.type === "status" && event.text) {
            setStatusText(event.text);
          } else if (event.type === "token" && event.token) {
            setStatusText(null);
            accumulated += event.token;
            setStreamingContent(accumulated);
          } else if (event.type === "done" && event.message) {
            if (event.threadId) setThreadId(event.threadId);
            const assistantWithCitations: WorkspaceMessage = {
              ...event.message,
              citations: normalizeCitations(event.citations),
            };
            setMessages((prev) => {
              const withoutOptimistic = prev.filter((m) => m.id !== optimisticUser.id);
              return [
                ...withoutOptimistic,
                { ...optimisticUser, id: event.message!.id + "-user" },
                assistantWithCitations,
              ];
            });
            if (event.edit?.proposals) {
              onEditProposals(event.edit.proposals);
            }
          } else if (event.type === "error" && event.error) {
            setError(event.error);
          }
        } catch {
          // skip malformed event
        }
      }
    }
  }

  setIsStreaming(false);
  setStreamingContent("");
  setStatusText(null);
}
