import { NextResponse } from "next/server";
import { sendChatMessageStub } from "@/src/features/chat/actions";
import { chatRequestSchema } from "@/src/lib/validation";

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

  const result = await sendChatMessageStub({
    projectId,
    content: parsed.data.content,
    mode: parsed.data.mode,
    threadId: parsed.data.threadId,
    selectedDocumentIds: parsed.data.selectedDocumentIds,
  });

  return NextResponse.json(result);
}
