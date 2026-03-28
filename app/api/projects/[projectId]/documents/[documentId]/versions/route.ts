import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    projectId: string;
    documentId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId, documentId } = await context.params;

  const body = (await request.json()) as {
    richJson?: unknown;
    plainText?: string;
  };

  if (!body.richJson && !body.plainText) {
    return NextResponse.json(
      { error: "Either richJson or plainText is required." },
      { status: 400 },
    );
  }

  const document = await prisma.document.findFirst({
    where: { id: documentId, projectId },
    select: { id: true, activeVersionId: true },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });

  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

  const plainText =
    body.plainText ??
    extractPlainTextFromTipTap(body.richJson as Record<string, unknown>);

  const version = await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    const newVersion = await tx.documentVersion.create({
      data: {
        documentId,
        parentVersionId: document.activeVersionId,
        versionNumber: nextVersionNumber,
        plainText,
        richJson: body.richJson ? (JSON.parse(JSON.stringify(body.richJson)) as object) : undefined,
        contentText: plainText,
        sourceLabel: "user-edit",
        createdBy: "user",
      },
    });

    await tx.document.update({
      where: { id: documentId },
      data: { activeVersionId: newVersion.id },
    });

    return newVersion;
  });

  return NextResponse.json({
    versionId: version.id,
    versionNumber: version.versionNumber,
    createdAt: version.createdAt.toISOString(),
  });
}

function extractPlainTextFromTipTap(json: Record<string, unknown>): string {
  if (!json || !json.content) return "";
  const content = json.content as Array<Record<string, unknown>>;
  return extractTextFromNodes(content);
}

function extractTextFromNodes(nodes: Array<Record<string, unknown>>): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.type === "text" && typeof node.text === "string") {
      parts.push(node.text);
    } else if (node.content && Array.isArray(node.content)) {
      parts.push(extractTextFromNodes(node.content as Array<Record<string, unknown>>));
    }
    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "listItem" ||
      node.type === "tableRow"
    ) {
      parts.push("\n\n");
    }
  }
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}
