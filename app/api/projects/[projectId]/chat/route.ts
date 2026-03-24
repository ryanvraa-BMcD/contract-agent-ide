import { NextResponse } from "next/server";
import { sendChatMessageStub } from "@/src/features/chat/actions";
import { chatRequestSchema } from "@/src/lib/validation";
import { runAskMode } from "@/src/server/ai/run-ask";
import { runPlanMode } from "@/src/server/ai/run-plan";
import { runEditMode } from "@/src/server/ai/run-edit";

type ChatRouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: Request, context: ChatRouteContext) {
  const { projectId } = await context.params;
  const body = await request.json();
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid chat request payload." }, { status: 400 });
  }

  if (parsed.data.mode === "Ask") {
    const askResult = await runAskMode({
      projectId,
      content: parsed.data.content,
      threadId: parsed.data.threadId,
      selectedDocumentIds: parsed.data.selectedDocumentIds,
    });
    return NextResponse.json(askResult);
  }

  if (parsed.data.mode === "Plan") {
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

  if (parsed.data.mode === "Edit") {
    const editResult = await runEditMode({
      projectId,
      content: parsed.data.content,
      threadId: parsed.data.threadId,
      selectedDocumentIds: parsed.data.selectedDocumentIds,
    });
    return NextResponse.json(editResult);
  }

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
}
