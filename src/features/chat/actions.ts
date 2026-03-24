import { AgentMode, AgentRunStatus, MessageRole } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { workspaceModeSchema } from "@/src/lib/validation";

const modeMap: Record<string, AgentMode> = {
  Ask: AgentMode.ASK,
  Plan: AgentMode.PLAN,
  Edit: AgentMode.EDIT,
  Compare: AgentMode.COMPARE,
};

export async function getOrCreateThread(projectId: string, threadId?: string) {
  if (threadId) {
    const existing = await prisma.chatThread.findFirst({
      where: {
        id: threadId,
        projectId,
      },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
    });

    if (existing) {
      return existing;
    }
  }

  return prisma.chatThread.create({
    data: {
      projectId,
      title: "Default workspace thread",
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function sendChatMessageStub(input: {
  projectId: string;
  content: string;
  mode: string;
  threadId?: string;
  selectedDocumentIds?: string[];
}) {
  const mode = workspaceModeSchema.parse(input.mode);
  const selectedDocumentIds = input.selectedDocumentIds ?? [];
  const thread = await getOrCreateThread(input.projectId, input.threadId);

  return prisma.$transaction(async (tx) => {
    const userMessage = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        role: MessageRole.USER,
        content: input.content,
      },
    });

    const agentRun = await tx.agentRun.create({
      data: {
        projectId: input.projectId,
        threadId: thread.id,
        mode: modeMap[mode],
        status: AgentRunStatus.RUNNING,
        inputText: input.content,
        selectedDocumentIds,
      },
    });

    const assistantMessage = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        role: MessageRole.ASSISTANT,
        content: `[Stubbed ${mode} response]\n\nI received your request and would process it against the selected contract context.`,
      },
    });

    await tx.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: AgentRunStatus.COMPLETED,
        outputText: assistantMessage.content,
        completedAt: new Date(),
      },
    });

    await tx.chatThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    return { threadId: thread.id, userMessage, assistantMessage, agentRunId: agentRun.id };
  });
}
