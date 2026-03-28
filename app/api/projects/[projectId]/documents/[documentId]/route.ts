import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    projectId: string;
    documentId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { projectId, documentId } = await context.params;

  const document = await prisma.document.findFirst({
    where: { id: documentId, projectId },
    select: { id: true },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  await prisma.document.delete({ where: { id: documentId } });

  return NextResponse.json({ deleted: true });
}
