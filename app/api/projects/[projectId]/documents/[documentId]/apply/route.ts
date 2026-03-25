import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { applyDeterministicOperations } from "@/src/server/editing/apply-operations";
import type { PersistedOperation } from "@/src/server/editing/operations";
import { buildApplyDiffPayload } from "@/src/server/editing/diff";
import { validateOperationsForApply } from "@/src/server/editing/validate-operations";

type RouteContext = {
  params: Promise<{
    projectId: string;
    documentId: string;
  }>;
};

type ApplyRequestBody = {
  targetVersionId: string;
  operationIds: string[];
};

function parseRequestBody(body: unknown): ApplyRequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object.");
  }
  const candidate = body as Record<string, unknown>;
  const targetVersionId = candidate.targetVersionId;
  const operationIds = candidate.operationIds;
  if (typeof targetVersionId !== "string" || !targetVersionId.trim()) {
    throw new Error("targetVersionId is required.");
  }
  if (!Array.isArray(operationIds) || operationIds.length === 0) {
    throw new Error("operationIds must be a non-empty array.");
  }
  const parsedIds = operationIds.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (parsedIds.length !== operationIds.length) {
    throw new Error("operationIds must contain only non-empty strings.");
  }
  return {
    targetVersionId: targetVersionId.trim(),
    operationIds: parsedIds,
  };
}

function hashTextContent(text: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  // Lightweight checksum placeholder until crypto digest integration.
  let hash = 0;
  for (const byte of bytes) {
    hash = (hash * 31 + byte) >>> 0;
  }
  return `text32_${hash.toString(16)}`;
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId, documentId } = await context.params;

  let body: ApplyRequestBody;
  try {
    const parsedBody = await request.json();
    body = parseRequestBody(parsedBody);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request payload." },
      { status: 400 }
    );
  }

  const targetVersion = await prisma.documentVersion.findFirst({
    where: {
      id: body.targetVersionId,
      documentId,
      document: { projectId },
    },
    select: {
      id: true,
      documentId: true,
      versionNumber: true,
      plainText: true,
      contentText: true,
      structuredJson: true,
      createdBy: true,
    },
  });

  if (!targetVersion) {
    return NextResponse.json({ error: "Target version not found." }, { status: 404 });
  }

  const operations = await prisma.editOperation.findMany({
    where: {
      id: { in: body.operationIds },
      editProposal: {
        projectId,
        documentId,
      },
    },
    select: {
      id: true,
      orderIndex: true,
      opType: true,
      findText: true,
      replaceText: true,
      insertText: true,
      targetLocatorJson: true,
      documentVersionId: true,
    },
  });

  if (operations.length !== body.operationIds.length) {
    return NextResponse.json(
      { error: "One or more operations were not found for this project/document." },
      { status: 400 }
    );
  }

  const chunks = await prisma.documentChunk.findMany({
    where: { documentVersionId: targetVersion.id },
    select: {
      id: true,
      documentVersionId: true,
      text: true,
      sourceStart: true,
      sourceEnd: true,
    },
  });

  let validated;
  try {
    validated = validateOperationsForApply({
      projectId,
      documentId,
      targetVersion,
      operations: operations as PersistedOperation[],
      chunks,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Operation validation failed.";
    await prisma.editOperation.updateMany({
      where: { id: { in: body.operationIds } },
      data: {
        applyStatus: "FAILED",
        applyError: message,
      },
    });
    return NextResponse.json({ error: message }, { status: 409 });
  }

  let applyResult;
  try {
    applyResult = applyDeterministicOperations({
      baseText: validated.baseText,
      operations: validated.validatedOperations,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to apply operations.";
    await prisma.editOperation.updateMany({
      where: { id: { in: body.operationIds } },
      data: {
        applyStatus: "FAILED",
        applyError: message,
      },
    });
    return NextResponse.json({ error: message }, { status: 409 });
  }

  try {
    const persisted = await prisma.$transaction(async (tx: any) => {
      const latest = await tx.documentVersion.findFirst({
        where: { documentId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

      const newVersion = await tx.documentVersion.create({
        data: {
          documentId,
          parentVersionId: targetVersion.id,
          versionNumber: nextVersionNumber,
          plainText: applyResult.updatedText,
          contentText: applyResult.updatedText,
          structuredJson: targetVersion.structuredJson as any,
          sizeBytes: applyResult.updatedText.length,
          checksum: hashTextContent(applyResult.updatedText),
          sourceLabel: `applied-v${targetVersion.versionNumber}`,
          createdBy: targetVersion.createdBy,
        },
        select: {
          id: true,
          versionNumber: true,
        },
      });

      await tx.document.update({
        where: { id: documentId },
        data: {
          activeVersionId: newVersion.id,
        },
      });

      for (const applied of applyResult.applied) {
        await tx.editOperation.update({
          where: { id: applied.operationId },
          data: {
            applyStatus: "APPLIED",
            applyError: null,
          },
        });
      }

      return { newVersion };
    });

    return NextResponse.json({
      newVersionId: persisted.newVersion.id,
      applied: applyResult.applied.map((operation) => ({
        operationId: operation.operationId,
        opType: operation.opType,
        status: operation.status,
      })),
      diff: buildApplyDiffPayload({
        beforeText: validated.baseText,
        afterText: applyResult.updatedText,
        appliedOperations: applyResult.applied,
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to persist applied version.";
    await prisma.editOperation.updateMany({
      where: { id: { in: body.operationIds } },
      data: {
        applyStatus: "FAILED",
        applyError: message,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
