"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  content: string;
  isStreaming?: boolean;
};

export function MarkdownMessage({ content, isStreaming }: MarkdownMessageProps) {
  return (
    <div className={`markdown-message ${isStreaming ? "streaming-cursor" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
