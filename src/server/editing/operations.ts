import { EditOperationType } from "@prisma/client";

export type DeterministicOperationType = "replace_text" | "insert_before" | "insert_after";

export type OperationTargetLocator = {
  documentId: string;
  versionId: string;
  chunkId?: string;
  headingPath?: string[];
};

export type PersistedOperation = {
  id: string;
  orderIndex: number;
  opType: EditOperationType;
  findText: string | null;
  replaceText: string | null;
  insertText: string | null;
  targetLocatorJson: unknown;
  documentVersionId: string | null;
};

export type ValidatedOperation = {
  id: string;
  orderIndex: number;
  opType: DeterministicOperationType;
  target: OperationTargetLocator;
  findText: string;
  replaceText?: string;
  insertText?: string;
  matchStart: number;
  matchEnd: number;
};

export type AppliedOperation = {
  operationId: string;
  opType: DeterministicOperationType;
  status: "applied";
  matchStart: number;
  matchEnd: number;
  beforeText: string;
  afterText: string;
};

export function mapPrismaOperationType(opType: EditOperationType): DeterministicOperationType {
  if (opType === EditOperationType.REPLACE_TEXT) return "replace_text";
  if (opType === EditOperationType.INSERT_BEFORE) return "insert_before";
  return "insert_after";
}

export function sortOperationsDeterministically<T extends { orderIndex: number; id: string }>(ops: T[]): T[] {
  return [...ops].sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    return a.id.localeCompare(b.id);
  });
}

export function countExactMatches(haystack: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (index <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

export function findAllMatchIndexes(haystack: string, needle: string) {
  const indexes: number[] = [];
  if (!needle) return indexes;
  let index = 0;
  while (index <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    indexes.push(found);
    index = found + needle.length;
  }
  return indexes;
}
