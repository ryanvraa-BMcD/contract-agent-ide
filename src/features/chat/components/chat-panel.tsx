"use client";

import {
  FormEvent,
  KeyboardEvent,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  SendHorizonal,
  MessageCircle,
  ClipboardList,
  Pencil,
  GitCompareArrows,
  Scale,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  Plus,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReviewProposal } from "@/src/features/review/types";
import type { WorkspaceMode } from "@/src/lib/validation";
import { MarkdownMessage } from "./markdown-message";

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
  onModeChange: (mode: WorkspaceMode) => void;
  selectedDocumentIds: string[];
  selectedDocumentTitles: string[];
  documentTitleById: Record<string, string>;
  onEditProposals: (proposals: ReviewProposal[]) => void;
  editProposals: ReviewProposal[];
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

type StreamEvent = {
  type: "token" | "done" | "error" | "thinking" | "status";
  token?: string;
  text?: string;
  message?: UiMessage;
  citations?: UiCitation[];
  threadId?: string;
  edit?: { proposals: ReviewProposal[] };
  error?: string;
};

const MODE_CONFIG: Record<WorkspaceMode, { icon: LucideIcon; label: string }> = {
  Ask: { icon: MessageCircle, label: "Ask" },
  Plan: { icon: ClipboardList, label: "Plan" },
  Edit: { icon: Pencil, label: "Edit" },
  Compare: { icon: GitCompareArrows, label: "Compare" },
};

const MODES: WorkspaceMode[] = ["Ask", "Plan", "Edit", "Compare"];

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

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel({
  projectId,
  initialThreadId,
  initialMessages,
  mode,
  onModeChange,
  selectedDocumentIds,
  selectedDocumentTitles,
  documentTitleById,
  onEditProposals,
  editProposals,
}: ChatPanelProps) {
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [pendingText, setPendingText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const [statusText, setStatusText] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, statusText, scrollToBottom]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!modeDropdownOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setModeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [modeDropdownOpen]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [pendingText, autoResize]);

  const toggleCitation = (messageId: string) => {
    setExpandedCitations((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const handleNewChat = useCallback(() => {
    if (isSending || isStreaming) return;
    setThreadId(null);
    setMessages([]);
    setStreamingContent("");
    setStatusText(null);
    setError(null);
    setExpandedCitations(new Set());
    setPendingText("");
    textareaRef.current?.focus();
  }, [isSending, isStreaming]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNewChat]);

  const submitMessage = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const content = pendingText.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setError(null);

    const optimisticUser: UiMessage = {
      id: `temp-${Date.now()}`,
      role: "USER",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setPendingText("");

    try {
      const useSSE = mode === "Ask" || mode === "Plan" || mode === "Edit";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (useSSE) {
        headers["Accept"] = "text/event-stream";
      }

      const response = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers,
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

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
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
                  const assistantWithCitations: UiMessage = {
                    ...event.message,
                    citations: normalizeCitations(event.citations),
                  };
                  setMessages((prev) => {
                    const withoutOptimistic = prev.filter(
                      (m) => m.id !== optimisticUser.id,
                    );
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
      } else {
        const payload = (await response.json()) as ChatResponse;
        setThreadId(payload.threadId);
        const assistantWithCitations: UiMessage = {
          ...payload.assistantMessage,
          citations: normalizeCitations(
            payload.citations ?? payload.assistantMessage.citations,
          ),
        };
        setMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (m) => m.id !== optimisticUser.id,
          );
          return [
            ...withoutOptimistic,
            payload.userMessage,
            assistantWithCitations,
          ];
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
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  return (
    <section className="flex h-full flex-col overflow-hidden border-l border-border bg-card">
      {/* Header with mode selector */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-card-foreground">Legal Assistant</h2>
            <button
              type="button"
              onClick={handleNewChat}
              disabled={isSending || isStreaming}
              title="New chat (Ctrl+L)"
              className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <div ref={modeDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setModeDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-card-foreground transition-colors hover:bg-muted/80"
              >
                {(() => { const Icon = MODE_CONFIG[mode].icon; return <Icon size={12} />; })()}
                {mode}
                <ChevronDown size={11} className={`text-muted-foreground transition-transform ${modeDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {modeDropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  {MODES.map((m) => {
                    const config = MODE_CONFIG[m];
                    const Icon = config.icon;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { onModeChange(m); setModeDropdownOpen(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition-colors ${
                          mode === m
                            ? "bg-accent text-accent-foreground"
                            : "text-card-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon size={13} />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewChat}
                disabled={isSending || isStreaming}
                title="Clear chat and start fresh"
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {selectedDocumentTitles.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {selectedDocumentTitles.map((title) => (
              <span
                key={title}
                className="flex max-w-[160px] items-center gap-1 truncate rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                title={title}
              >
                <FileText size={9} className="shrink-0" />
                {title}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-warning">
            <FileText size={11} />
            No documents selected for context.
          </p>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto p-4"
      >
        <div className="space-y-4">
          {messages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/50 p-8 text-center">
              <Scale size={28} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-card-foreground">
                  Legal Assistant Ready
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ask questions, request a review plan, or propose edits to your contracts.
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const isUser = message.role === "USER";
              const hasCitations =
                message.role === "ASSISTANT" &&
                message.citations &&
                message.citations.length > 0;
              const citationsExpanded = expandedCitations.has(message.id);

              return (
                <article
                  key={message.id}
                  className={`animate-fade-in flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent text-accent-foreground"
                    }`}
                  >
                    {isUser ? <User size={14} /> : <Scale size={14} />}
                  </div>

                  {/* Content */}
                  <div className={`min-w-0 max-w-[85%] ${isUser ? "text-right" : ""}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        isUser
                          ? "rounded-tr-md bg-primary text-primary-foreground"
                          : "rounded-tl-md bg-muted text-card-foreground"
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                          {message.content}
                        </p>
                      ) : (
                        <MarkdownMessage content={message.content} />
                      )}
                    </div>

                    {/* Citations */}
                    {hasCitations && (
                      <div className="mt-1.5">
                        <button
                          type="button"
                          onClick={() => toggleCitation(message.id)}
                          className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition hover:text-card-foreground"
                        >
                          <FileText size={10} />
                          {message.citations!.length} citation{message.citations!.length > 1 ? "s" : ""}
                          {citationsExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </button>
                        {citationsExpanded && (
                          <div className="mt-1 space-y-1">
                            {message.citations!.map((citation, citIdx) => (
                              <div
                                key={`${message.id}-${citation.chunkId}-${citIdx}`}
                                className="rounded-lg border border-border bg-card px-3 py-2 text-xs"
                              >
                                <p className="truncate font-medium text-card-foreground">
                                  {documentTitleById[citation.documentId] || citation.documentId}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-[11px] italic text-muted-foreground">
                                  &ldquo;{citation.snippet}&rdquo;
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <p className={`mt-1 text-[10px] text-muted-foreground ${isUser ? "text-right" : ""}`}>
                      {formatTime(message.createdAt)}
                    </p>
                  </div>
                </article>
              );
            })
          )}

          {/* Streaming response */}
          {isStreaming && streamingContent && (
            <article className="animate-fade-in flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Scale size={14} />
              </div>
              <div className="min-w-0 max-w-[85%]">
                <div className="rounded-2xl rounded-tl-md bg-muted px-4 py-3 text-card-foreground">
                  <MarkdownMessage content={streamingContent} isStreaming />
                </div>
              </div>
            </article>
          )}

          {/* Typing / status indicator */}
          {((isSending && !streamingContent) || (isStreaming && statusText && !streamingContent)) && (
            <div className="animate-fade-in flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Scale size={14} />
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-muted px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                </div>
                {statusText && (
                  <span className="text-[11px] text-muted-foreground">{statusText}</span>
                )}
              </div>
            </div>
          )}

          {/* Edit proposals summary */}
          {editProposals.length > 0 && (
            <div className="animate-fade-in rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
              <p className="text-xs font-semibold text-warning">
                {editProposals.length} edit proposal
                {editProposals.length > 1 ? "s" : ""} pending
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {editProposals.map((proposal, idx) => (
                  <li
                    key={`${proposal.title}-${idx}`}
                    className="flex items-center gap-1.5 text-[11px] text-warning"
                  >
                    <Pencil size={10} />
                    {proposal.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card p-2 shadow-lg transition-colors hover:bg-muted"
          >
            <ArrowDown size={14} className="text-card-foreground" />
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border p-3">
        {error && (
          <div className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            {error}
          </div>
        )}
        <form onSubmit={submitMessage} className="flex items-end gap-2">
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={pendingText}
              onChange={(event) => setPendingText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === "Edit"
                  ? "Describe the changes you want..."
                  : "Ask about the contract..."
              }
              rows={1}
              className="max-h-[150px] w-full resize-none rounded-xl border border-input bg-muted/50 px-4 py-2.5 text-sm text-card-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={isSending || !pendingText.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            title="Send (Enter)"
          >
            <SendHorizonal size={16} />
          </button>
        </form>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Enter to send, Shift+Enter for new line
        </p>
      </div>
    </section>
  );
}
