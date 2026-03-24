import { AgentMode, AgentRunStatus, MessageRole } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { askModeResponseSchema, type AskModeResponse } from "@/src/server/ai/schemas";
import { buildGroundedAskContext } from "@/src/server/retrieval/build-context";
import { getOrCreateThread } from "@/src/features/chat/actions";

type RunAskModeInput = {
  projectId: string;
  content: string;
  threadId?: string;
  selectedDocumentIds?: string[];
};

type RunAskModeResult = {
  threadId: string;
  userMessage: {
    id: string;
    role: "USER";
    content: string;
    createdAt: Date;
  };
  assistantMessage: {
    id: string;
    role: "ASSISTANT";
    content: string;
    createdAt: Date;
  };
  agentRunId: string;
  citations: AskModeResponse["citations"];
};

function truncateSnippet(text: string, maxLength = 240) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function buildAskResponseFromContext(content: string, context: Awaited<ReturnType<typeof buildGroundedAskContext>>) {
  if (context.rankedChunks.length === 0) {
    return {
      answer:
        "I could not find relevant passages in the selected document context for this question. Try selecting additional documents or rephrasing with clause keywords.",
      citations: [],
    };
  }

  const topChunks = context.rankedChunks.slice(0, 3);
  const citedDocuments = Array.from(new Set(topChunks.map((chunk) => chunk.documentTitle)));
  const answer = `Based on the selected documents (${citedDocuments.join(
    ", "
  )}), here are the most relevant passages for your question: "${content.trim()}".`;

  const citations = topChunks.map((chunk) => ({
    documentId: chunk.documentId,
    versionId: chunk.versionId,
    chunkId: chunk.chunkId,
    snippet: truncateSnippet(chunk.text),
  }));

  return { answer, citations };
}

export async function runAskMode(input: RunAskModeInput): Promise<RunAskModeResult> {
  const thread = await getOrCreateThread(input.projectId, input.threadId);

  const context = await buildGroundedAskContext({
    projectId: input.projectId,
    query: input.content,
    selectedDocumentIds: input.selectedDocumentIds,
    maxChunks: 8,
  });

  // MVP grounded responder: lexical retrieval + deterministic synthesis.
  // TODO: Replace with Responses API call while preserving this strict schema contract.
  const rawModelOutput = buildAskResponseFromContext(input.content, context);
  const validated = askModeResponseSchema.parse(rawModelOutput);

  return prisma.$transaction(async (tx) => {
    const userMessage = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        role: MessageRole.USER,
        content: input.content,
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    const agentRun = await tx.agentRun.create({
      data: {
        projectId: input.projectId,
        threadId: thread.id,
        mode: AgentMode.ASK,
        status: AgentRunStatus.RUNNING,
        inputText: input.content,
        selectedDocumentIds: context.resolvedDocumentIds,
        requestJson: {
          question: input.content,
          selectedDocumentIds: context.selectedDocumentIds,
        },
      },
      select: { id: true },
    });

    const assistantMessage = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        agentRunId: agentRun.id,
        role: MessageRole.ASSISTANT,
        content: validated.answer,
        citationsJson: validated.citations,
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    await tx.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: AgentRunStatus.COMPLETED,
        outputText: validated.answer,
        responseJson: {
          answer: validated.answer,
          citations: validated.citations,
        },
        completedAt: new Date(),
      },
    });

    await tx.chatThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    return {
      threadId: thread.id,
      userMessage: {
        ...userMessage,
        role: "USER" as const,
      },
      assistantMessage: {
        ...assistantMessage,
        role: "ASSISTANT" as const,
      },
      agentRunId: agentRun.id,
      citations: validated.citations,
    };
  });
}
