import {
  AgentMode,
  AgentRunStatus,
  DocumentRole,
  EditOperationType,
  MessageRole,
} from "@prisma/client";
import { prisma, type TransactionClient } from "@/src/lib/prisma";
import { getOrCreateThread } from "@/src/features/chat/actions";
import { buildGroundedAskContext } from "@/src/server/retrieval/build-context";
import { type EditModeResponse } from "@/src/server/ai/schemas";
import { callGeminiEdit } from "@/src/server/ai/gemini-calls";

type RunEditModeInput = {
  projectId: string;
  content: string;
  threadId?: string;
  selectedDocumentIds?: string[];
  onContextReady?: () => void;
};

type RunEditModeResult = {
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
  edit: EditModeResponse;
  citations: {
    documentId: string;
    versionId: string;
    chunkId: string;
    snippet: string;
  }[];
};

function validateOperationalSafety(
  edit: EditModeResponse,
  readOnlyDocumentIds: Set<string>,
) {
  for (const proposal of edit.proposals) {
    if (proposal.citations.length === 0) {
      throw new Error("Edit proposal missing citations.");
    }
    for (const operation of proposal.operations) {
      if (readOnlyDocumentIds.has(operation.target.documentId)) {
        throw new Error(
          "Edit operations must not target read-only documents. Reference documents and PDFs are read-only context.",
        );
      }
      if (operation.opType === "replace_text") {
        if (!operation.findText || !operation.replaceText) {
          throw new Error("replace_text operations require findText and replaceText.");
        }
        if (operation.findText.trim().length < 8) {
          throw new Error("replace_text findText is too short and may be ambiguous.");
        }
      }
      if (
        (operation.opType === "insert_before" || operation.opType === "insert_after") &&
        !operation.insertText
      ) {
        throw new Error("insert operations require insertText.");
      }
      const citationMatch = proposal.citations.some(
        (citation) =>
          citation.documentId === operation.target.documentId &&
          citation.versionId === operation.target.versionId &&
          citation.chunkId === operation.target.chunkId
      );
      if (!citationMatch) {
        throw new Error("Operation target must match at least one proposal citation.");
      }
    }
  }
}

function mapOperationTypeToPrisma(opType: "replace_text" | "insert_before" | "insert_after") {
  if (opType === "replace_text") return EditOperationType.REPLACE_TEXT;
  if (opType === "insert_before") return EditOperationType.INSERT_BEFORE;
  return EditOperationType.INSERT_AFTER;
}

function renderEditSummary(edit: EditModeResponse) {
  if (edit.proposals.length === 0) {
    return "No grounded edit proposals were generated for the selected document context.";
  }
  const lines = [
    `Generated ${edit.proposals.length} grounded edit proposal(s).`,
    "",
    ...edit.proposals.map(
      (proposal, index) =>
        `${index + 1}. ${proposal.title}\n   Rationale: ${proposal.rationale}\n   Operations: ${proposal.operations.length}`
    ),
  ];
  return lines.join("\n");
}

export async function runEditMode(input: RunEditModeInput): Promise<RunEditModeResult> {
  const thread = await getOrCreateThread(input.projectId, input.threadId);
  const context = await buildGroundedAskContext({
    projectId: input.projectId,
    query: input.content,
    selectedDocumentIds: input.selectedDocumentIds,
    maxChunks: 10,
  });

  input.onContextReady?.();

  const initial = await prisma.$transaction(async (tx: TransactionClient) => {
    const userMessage = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        role: MessageRole.USER,
        content: input.content,
      },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    const agentRun = await tx.agentRun.create({
      data: {
        projectId: input.projectId,
        threadId: thread.id,
        mode: AgentMode.EDIT,
        status: AgentRunStatus.RUNNING,
        inputText: input.content,
        selectedDocumentIds: context.resolvedDocumentIds,
        requestJson: {
          question: input.content,
          selectedDocumentIds: context.selectedDocumentIds,
        } as any,
      },
      select: { id: true },
    });

    return { userMessage, agentRunId: agentRun.id };
  });

  const readOnlyDocIds = new Set(
    context.rankedChunks
      .filter((c) =>
        c.documentRole === DocumentRole.REFERENCE ||
        c.originalMimeType === "application/pdf",
      )
      .map((c) => c.documentId),
  );

  try {
    const edit = await callGeminiEdit(input.content, context.rankedChunks);
    validateOperationalSafety(edit, readOnlyDocIds);

    const assistantContent = renderEditSummary(edit);
    const citations = edit.proposals.flatMap((proposal) => proposal.citations);

    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      for (const proposal of edit.proposals) {
        const target = proposal.operations[0]?.target ?? proposal.citations[0];
        const createdProposal = await tx.editProposal.create({
          data: {
            agentRunId: initial.agentRunId,
            projectId: input.projectId,
            documentId: target.documentId,
            targetVersionId: target.versionId,
            title: proposal.title,
            rationale: proposal.rationale,
            summary: proposal.rationale,
            patchText: JSON.stringify(proposal.operations),
          },
          select: { id: true },
        });

        await tx.editOperation.createMany({
          data: proposal.operations.map((operation, index) => ({
            editProposalId: createdProposal.id,
            documentVersionId: operation.target.versionId,
            opType: mapOperationTypeToPrisma(operation.opType),
            targetLocatorJson: operation.target as any,
            findText: operation.findText,
            replaceText: operation.replaceText,
            insertText: operation.insertText,
            orderIndex: index,
          })),
        });
      }

      const assistantMessage = await tx.chatMessage.create({
        data: {
          threadId: thread.id,
          agentRunId: initial.agentRunId,
          role: MessageRole.ASSISTANT,
          content: assistantContent,
          citationsJson: citations as any,
        },
        select: { id: true, role: true, content: true, createdAt: true },
      });

      await tx.agentRun.update({
        where: { id: initial.agentRunId },
        data: {
          status: AgentRunStatus.COMPLETED,
          outputText: assistantContent,
          responseJson: edit as any,
          completedAt: new Date(),
        },
      });

      await tx.chatThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });

      return { assistantMessage };
    });

    return {
      threadId: thread.id,
      userMessage: {
        ...initial.userMessage,
        role: "USER" as const,
      },
      assistantMessage: {
        ...result.assistantMessage,
        role: "ASSISTANT" as const,
      },
      agentRunId: initial.agentRunId,
      edit,
      citations,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Edit proposal generation failed safely.";
    const assistantContent = `Unable to generate safe edit proposals: ${errorMessage}`;

    const failed = await prisma.$transaction(async (tx: TransactionClient) => {
      const assistantMessage = await tx.chatMessage.create({
        data: {
          threadId: thread.id,
          agentRunId: initial.agentRunId,
          role: MessageRole.ASSISTANT,
          content: assistantContent,
        },
        select: { id: true, role: true, content: true, createdAt: true },
      });

      await tx.agentRun.update({
        where: { id: initial.agentRunId },
        data: {
          status: AgentRunStatus.FAILED,
          outputText: assistantContent,
          responseJson: { error: errorMessage } as any,
          completedAt: new Date(),
        },
      });

      await tx.chatThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });

      return { assistantMessage };
    });

    return {
      threadId: thread.id,
      userMessage: {
        ...initial.userMessage,
        role: "USER" as const,
      },
      assistantMessage: {
        ...failed.assistantMessage,
        role: "ASSISTANT" as const,
      },
      agentRunId: initial.agentRunId,
      edit: { proposals: [] },
      citations: [],
    };
  }
}
