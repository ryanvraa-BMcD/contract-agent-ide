import { AgentMode, AgentRunStatus, MessageRole } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { getOrCreateThread } from "@/src/features/chat/actions";
import { planModeResponseSchema, type PlanModeResponse } from "@/src/server/ai/schemas";
import { buildGroundedAskContext } from "@/src/server/retrieval/build-context";

type RunPlanModeInput = {
  projectId: string;
  content: string;
  threadId?: string;
  selectedDocumentIds?: string[];
};

type RunPlanModeResult = {
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
  plan: PlanModeResponse;
};

function truncateSnippet(text: string, maxLength = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function priorityFromScore(score: number): "low" | "medium" | "high" {
  if (score >= 12) return "high";
  if (score >= 7) return "medium";
  return "low";
}

function buildPlanFromContext(
  content: string,
  context: Awaited<ReturnType<typeof buildGroundedAskContext>>
): PlanModeResponse {
  if (context.rankedChunks.length === 0) {
    return {
      summary:
        "Insufficient grounded context was found in the selected documents to build a harmonization plan.",
      items: [],
    };
  }

  const top = context.rankedChunks.slice(0, 5);
  const items = top.map((chunk, index) => {
    const headingRef =
      chunk.headingPath.length > 0 ? chunk.headingPath.join(" > ") : "Unlabeled section";

    return {
      id: `plan_${index + 1}`,
      issue: `Review potential inconsistency in ${chunk.documentTitle} (${headingRef}).`,
      whyItMatters:
        "Ambiguous or inconsistent language across related contract documents can create interpretation risk and negotiation friction.",
      priority: priorityFromScore(chunk.score),
      citations: [
        {
          documentId: chunk.documentId,
          versionId: chunk.versionId,
          chunkId: chunk.chunkId,
          snippet: truncateSnippet(chunk.text),
        },
      ],
    };
  });

  const documentCount = new Set(top.map((chunk) => chunk.documentId)).size;
  return {
    summary: `Generated a grounded harmonization plan for "${content.trim()}" using ${top.length} relevant chunks across ${documentCount} selected document(s).`,
    items,
  };
}

function renderPlanAsAssistantText(plan: PlanModeResponse) {
  if (plan.items.length === 0) {
    return `${plan.summary}\n\nNo grounded plan items were produced.`;
  }

  const lines = [
    plan.summary,
    "",
    ...plan.items.map(
      (item, index) => `${index + 1}. [${item.priority.toUpperCase()}] ${item.issue}\n   Why: ${item.whyItMatters}`
    ),
  ];
  return lines.join("\n");
}

export async function runPlanMode(input: RunPlanModeInput): Promise<RunPlanModeResult> {
  const thread = await getOrCreateThread(input.projectId, input.threadId);

  const context = await buildGroundedAskContext({
    projectId: input.projectId,
    query: input.content,
    selectedDocumentIds: input.selectedDocumentIds,
    maxChunks: 10,
  });

  // MVP deterministic planner using grounded lexical context.
  // TODO: Replace with model call while retaining this strict response contract.
  const rawPlan = buildPlanFromContext(input.content, context);
  const plan = planModeResponseSchema.parse(rawPlan);
  const assistantText = renderPlanAsAssistantText(plan);

  return prisma.$transaction(async (tx: any) => {
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
        mode: AgentMode.PLAN,
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
        content: assistantText,
        citationsJson: plan.items.flatMap((item) => item.citations),
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
        outputText: assistantText,
        responseJson: plan,
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
      plan,
    };
  });
}
