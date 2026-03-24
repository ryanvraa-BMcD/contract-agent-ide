import type { DocumentChunk, DocumentVersion } from "@prisma/client";
import {
  countExactMatches,
  findAllMatchIndexes,
  mapPrismaOperationType,
  sortOperationsDeterministically,
  type OperationTargetLocator,
  type PersistedOperation,
  type ValidatedOperation,
} from "@/src/server/editing/operations";

type ValidateOperationsInput = {
  projectId: string;
  documentId: string;
  targetVersion: Pick<DocumentVersion, "id" | "documentId" | "plainText" | "contentText">;
  operations: PersistedOperation[];
  chunks: Pick<DocumentChunk, "id" | "documentVersionId" | "text" | "sourceStart" | "sourceEnd">[];
};

type ValidateOperationsResult = {
  baseText: string;
  validatedOperations: ValidatedOperation[];
};

function parseTargetLocator(value: unknown): OperationTargetLocator {
  if (!value || typeof value !== "object") {
    throw new Error("Operation target locator is missing.");
  }
  const locator = value as Record<string, unknown>;
  if (typeof locator.documentId !== "string" || typeof locator.versionId !== "string") {
    throw new Error("Operation target locator must include documentId and versionId.");
  }
  if (locator.chunkId !== undefined && typeof locator.chunkId !== "string") {
    throw new Error("Operation target locator chunkId must be a string.");
  }
  return {
    documentId: locator.documentId,
    versionId: locator.versionId,
    chunkId: typeof locator.chunkId === "string" ? locator.chunkId : undefined,
    headingPath: Array.isArray(locator.headingPath)
      ? locator.headingPath.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

function resolveMatchStartInScope(params: {
  baseText: string;
  findText: string;
  scopeStart?: number;
  scopeEnd?: number;
}) {
  const { baseText, findText, scopeStart, scopeEnd } = params;
  if (scopeStart === undefined || scopeEnd === undefined) {
    const all = findAllMatchIndexes(baseText, findText);
    if (all.length !== 1) {
      throw new Error(
        all.length === 0
          ? `findText not found exactly once in document: "${findText}"`
          : `Ambiguous findText match in document (${all.length} matches): "${findText}"`
      );
    }
    return all[0];
  }

  const clampedStart = Math.max(0, scopeStart);
  const clampedEnd = Math.min(baseText.length, scopeEnd);
  if (clampedEnd <= clampedStart) {
    throw new Error("Invalid scoped range for operation.");
  }
  const scopedText = baseText.slice(clampedStart, clampedEnd);
  const scopedMatches = findAllMatchIndexes(scopedText, findText);
  if (scopedMatches.length !== 1) {
    throw new Error(
      scopedMatches.length === 0
        ? `findText not found in scoped chunk range: "${findText}"`
        : `Ambiguous findText match in scoped chunk range (${scopedMatches.length} matches): "${findText}"`
    );
  }

  const globalIndex = clampedStart + scopedMatches[0];
  const globalCount = countExactMatches(baseText, findText);
  if (globalCount > 1) {
    throw new Error(
      `Ambiguous findText match across document (${globalCount} total matches); provide a more specific anchor.`
    );
  }
  return globalIndex;
}

export function validateOperationsForApply(input: ValidateOperationsInput): ValidateOperationsResult {
  const baseText = (input.targetVersion.plainText || input.targetVersion.contentText || "").trim();
  if (!baseText) {
    throw new Error("Target version has no text content to apply operations against.");
  }

  if (input.targetVersion.documentId !== input.documentId) {
    throw new Error("Target version does not belong to the requested document.");
  }

  const chunkById = new Map(input.chunks.map((chunk) => [chunk.id, chunk] as const));
  const validatedOperations: ValidatedOperation[] = [];

  for (const operation of sortOperationsDeterministically(input.operations)) {
    const target = parseTargetLocator(operation.targetLocatorJson);

    if (target.documentId !== input.documentId) {
      throw new Error(`Operation ${operation.id} targets a different document.`);
    }
    if (target.versionId !== input.targetVersion.id) {
      throw new Error(`Operation ${operation.id} targets a different document version.`);
    }
    if (operation.documentVersionId && operation.documentVersionId !== input.targetVersion.id) {
      throw new Error(`Operation ${operation.id} has mismatched documentVersionId.`);
    }

    const opType = mapPrismaOperationType(operation.opType);
    const findText = operation.findText?.trim();
    if (!findText) {
      throw new Error(`Operation ${operation.id} is missing findText anchor.`);
    }

    let scopeStart: number | undefined;
    let scopeEnd: number | undefined;
    if (target.chunkId) {
      const chunk = chunkById.get(target.chunkId);
      if (!chunk) {
        throw new Error(`Operation ${operation.id} references missing chunk ${target.chunkId}.`);
      }
      if (chunk.documentVersionId !== input.targetVersion.id) {
        throw new Error(`Operation ${operation.id} chunk belongs to a different version.`);
      }
      scopeStart = chunk.sourceStart ?? undefined;
      scopeEnd = chunk.sourceEnd ?? undefined;
    }

    const matchStart = resolveMatchStartInScope({
      baseText,
      findText,
      scopeStart,
      scopeEnd,
    });
    const matchEnd = matchStart + findText.length;

    if (opType === "replace_text") {
      const replaceText = operation.replaceText?.trim();
      if (!replaceText) {
        throw new Error(`Operation ${operation.id} replace_text requires replaceText.`);
      }
      validatedOperations.push({
        id: operation.id,
        orderIndex: operation.orderIndex,
        opType,
        target,
        findText,
        replaceText,
        matchStart,
        matchEnd,
      });
      continue;
    }

    const insertText = operation.insertText?.trim();
    if (!insertText) {
      throw new Error(`Operation ${operation.id} insert operation requires insertText.`);
    }
    validatedOperations.push({
      id: operation.id,
      orderIndex: operation.orderIndex,
      opType,
      target,
      findText,
      insertText,
      matchStart,
      matchEnd,
    });
  }

  return { baseText, validatedOperations };
}
