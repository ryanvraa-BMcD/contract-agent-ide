import { NextResponse } from "next/server";
import { AgentMode, AgentRunStatus, MessageRole } from "@prisma/client";
import { prisma, type TransactionClient } from "@/src/lib/prisma";
import { sendChatMessageStub, getOrCreateThread } from "@/src/features/chat/actions";
import { chatRequestSchema } from "@/src/lib/validation";
import { streamGeminiAsk } from "@/src/server/ai/gemini-calls";
import { buildGroundedAskContext } from "@/src/server/retrieval/build-context";
import { runAskMode } from "@/src/server/ai/run-ask";
import { runPlanMode } from "@/src/server/ai/run-plan";
import { runEditMode } from "@/src/server/ai/run-edit";
import { parseJsonBody } from "@/src/lib/api-helpers";

type ChatRouteContext = {
  params: Promise<{ projectId: string }>;
};

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function rateLimitMessage(msg: string): boolean {
  return msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
}

function sseErrorEvent(err: unknown): string {
  const message = err instanceof Error ? err.message : "Chat request failed.";
  return sseEvent({
    type: "error",
    error: rateLimitMessage(message)
      ? "AI rate limit exceeded. Please wait a moment and try again."
      : "An error occurred processing your request.",
  });
}

function createSSEResponse(handler: (encoder: TextEncoder, enqueue: (chunk: string) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      try {
        await handler(encoder, enqueue);
      } finally {
        enqueue("data: [DONE]\n\n");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request, context: ChatRouteContext) {
  const { projectId } = await context.params;
  const result = await parseJsonBody(request, chatRequestSchema);
  if (result.error) return result.error;
  const parsed = { data: result.data };

  const acceptsStream = request.headers.get("accept")?.includes("text/event-stream");

  try {
    /* ------------------------------------------------------------------ */
    /*  ASK MODE                                                          */
    /* ------------------------------------------------------------------ */
    if (parsed.data.mode === "Ask") {
      if (acceptsStream) {
        return createSSEResponse(async (_encoder, enqueue) => {
          try {
            enqueue(sseEvent({ type: "status", text: "Searching documents..." }));

            const thread = await getOrCreateThread(projectId, parsed.data.threadId);
            const ctx = await buildGroundedAskContext({
              projectId,
              query: parsed.data.content,
              selectedDocumentIds: parsed.data.selectedDocumentIds,
              maxChunks: 8,
            });

            enqueue(sseEvent({ type: "status", text: "Generating answer..." }));

            const gen = streamGeminiAsk(parsed.data.content, ctx.rankedChunks);
            let fullAnswer = "";
            let citations: { documentId: string; versionId: string; chunkId: string; snippet: string }[] = [];
            while (true) {
              const { value, done } = await gen.next();
              if (done) {
                if (value) {
                  fullAnswer = value.answer;
                  citations = value.citations;
                }
                break;
              }
              enqueue(sseEvent({ type: "token", token: value }));
            }

            if (!fullAnswer) fullAnswer = "(No response generated)";

            const saved = await prisma.$transaction(async (tx: TransactionClient) => {
              const userMessage = await tx.chatMessage.create({
                data: { threadId: thread.id, role: MessageRole.USER, content: parsed.data.content },
                select: { id: true, role: true, content: true, createdAt: true },
              });
              const agentRun = await tx.agentRun.create({
                data: {
                  projectId,
                  threadId: thread.id,
                  mode: AgentMode.ASK,
                  status: AgentRunStatus.COMPLETED,
                  inputText: parsed.data.content,
                  selectedDocumentIds: ctx.resolvedDocumentIds,
                  outputText: fullAnswer,
                  responseJson: { answer: fullAnswer, citations },
                  completedAt: new Date(),
                },
                select: { id: true },
              });
              const assistantMessage = await tx.chatMessage.create({
                data: {
                  threadId: thread.id,
                  agentRunId: agentRun.id,
                  role: MessageRole.ASSISTANT,
                  content: fullAnswer,
                  citationsJson: citations,
                },
                select: { id: true, role: true, content: true, createdAt: true },
              });
              await tx.chatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
              return { userMessage, assistantMessage };
            });

            enqueue(sseEvent({
              type: "done",
              threadId: thread.id,
              message: { ...saved.assistantMessage, role: "ASSISTANT" },
              citations,
            }));
          } catch (err: unknown) {
            enqueue(sseErrorEvent(err));
          }
        });
      }

      const askResult = await runAskMode({
        projectId,
        content: parsed.data.content,
        threadId: parsed.data.threadId,
        selectedDocumentIds: parsed.data.selectedDocumentIds,
      });
      return NextResponse.json(askResult);
    }

    /* ------------------------------------------------------------------ */
    /*  PLAN MODE                                                         */
    /* ------------------------------------------------------------------ */
    if (parsed.data.mode === "Plan") {
      if (acceptsStream) {
        return createSSEResponse(async (_encoder, enqueue) => {
          try {
            enqueue(sseEvent({ type: "status", text: "Searching documents..." }));

            const planResult = await runPlanMode({
              projectId,
              content: parsed.data.content,
              threadId: parsed.data.threadId,
              selectedDocumentIds: parsed.data.selectedDocumentIds,
              onContextReady: () => {
                enqueue(sseEvent({ type: "status", text: "Generating review plan..." }));
              },
            });

            enqueue(sseEvent({
              type: "done",
              threadId: planResult.threadId,
              message: { ...planResult.assistantMessage, role: "ASSISTANT" },
              citations: planResult.plan.items.flatMap((item) => item.citations),
            }));
          } catch (err: unknown) {
            enqueue(sseErrorEvent(err));
          }
        });
      }

      const planResult = await runPlanMode({
        projectId,
        content: parsed.data.content,
        threadId: parsed.data.threadId,
        selectedDocumentIds: parsed.data.selectedDocumentIds,
      });
      return NextResponse.json({
        ...planResult,
        citations: planResult.plan.items.flatMap((item) => item.citations),
      });
    }

    /* ------------------------------------------------------------------ */
    /*  EDIT MODE                                                         */
    /* ------------------------------------------------------------------ */
    if (parsed.data.mode === "Edit") {
      if (acceptsStream) {
        return createSSEResponse(async (_encoder, enqueue) => {
          try {
            enqueue(sseEvent({ type: "status", text: "Searching documents..." }));

            const editResult = await runEditMode({
              projectId,
              content: parsed.data.content,
              threadId: parsed.data.threadId,
              selectedDocumentIds: parsed.data.selectedDocumentIds,
              onContextReady: () => {
                enqueue(sseEvent({ type: "status", text: "Generating edit proposals..." }));
              },
            });

            enqueue(sseEvent({
              type: "done",
              threadId: editResult.threadId,
              message: { ...editResult.assistantMessage, role: "ASSISTANT" },
              citations: editResult.citations,
              edit: { proposals: editResult.edit.proposals },
            }));
          } catch (err: unknown) {
            enqueue(sseErrorEvent(err));
          }
        });
      }

      const editResult = await runEditMode({
        projectId,
        content: parsed.data.content,
        threadId: parsed.data.threadId,
        selectedDocumentIds: parsed.data.selectedDocumentIds,
      });
      return NextResponse.json(editResult);
    }

    /* ------------------------------------------------------------------ */
    /*  FALLBACK (Compare, etc.)                                          */
    /* ------------------------------------------------------------------ */
    const stubResult = await sendChatMessageStub({
      projectId,
      content: parsed.data.content,
      mode: parsed.data.mode,
      threadId: parsed.data.threadId,
      selectedDocumentIds: parsed.data.selectedDocumentIds,
    });
    return NextResponse.json({
      ...stubResult,
      citations: [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Chat request failed.";
    const status = rateLimitMessage(message) ? 429 : 500;
    const userMessage = rateLimitMessage(message)
      ? "AI rate limit exceeded. Please wait a moment and try again."
      : "An error occurred processing your request.";
    return NextResponse.json({ error: userMessage }, { status });
  }
}
