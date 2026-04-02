import { AgentMode, AgentRunStatus, MessageRole } from "@prisma/client";
import { prisma, type TransactionClient } from "@/src/lib/prisma";
import { type AskModeResponse } from "@/src/server/ai/schemas";
import { buildGroundedAskContext } from "@/src/server/retrieval/build-context";
import { getOrCreateThread } from "@/src/features/chat/actions";
import { callGeminiAsk } from "@/src/server/ai/gemini-calls";

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

export async function runAskMode(input: RunAskModeInput): Promise<RunAskModeResult> {
  const thread = await getOrCreateThread(input.projectId, input.threadId);

  const context = await buildGroundedAskContext({
    projectId: input.projectId,
    query: input.content,
    selectedDocumentIds: input.selectedDocumentIds,
    maxChunks: 8,
  });

  const validated = await callGeminiAsk(input.content, context.rankedChunks);

  return prisma.$transaction(async (tx: TransactionClient) => {
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
