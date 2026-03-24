import type { AppliedOperation, ValidatedOperation } from "@/src/server/editing/operations";

type ApplyOperationsInput = {
  baseText: string;
  operations: ValidatedOperation[];
};

type ApplyOperationsResult = {
  updatedText: string;
  applied: AppliedOperation[];
};

export function applyDeterministicOperations(input: ApplyOperationsInput): ApplyOperationsResult {
  const applyOrder = [...input.operations].sort((a, b) => {
    if (a.matchStart !== b.matchStart) return b.matchStart - a.matchStart;
    if (a.orderIndex !== b.orderIndex) return b.orderIndex - a.orderIndex;
    return b.id.localeCompare(a.id);
  });

  let updatedText = input.baseText;
  const applied: AppliedOperation[] = [];

  for (const operation of applyOrder) {
    const currentAnchor = updatedText.slice(operation.matchStart, operation.matchEnd);
    if (currentAnchor !== operation.findText) {
      throw new Error(
        `Operation ${operation.id} failed deterministic anchor check before apply (text has shifted).`
      );
    }

    let replacement = "";
    if (operation.opType === "replace_text") {
      replacement = operation.replaceText ?? "";
    } else if (operation.opType === "insert_before") {
      replacement = `${operation.insertText ?? ""}${operation.findText}`;
    } else {
      replacement = `${operation.findText}${operation.insertText ?? ""}`;
    }

    updatedText =
      updatedText.slice(0, operation.matchStart) + replacement + updatedText.slice(operation.matchEnd);

    applied.push({
      operationId: operation.id,
      opType: operation.opType,
      status: "applied",
      matchStart: operation.matchStart,
      matchEnd: operation.matchEnd,
      beforeText: operation.findText,
      afterText: replacement,
    });
  }

  return {
    updatedText,
    applied: applied.reverse(),
  };
}
