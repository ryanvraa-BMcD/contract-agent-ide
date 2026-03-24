import type { AppliedOperation } from "@/src/server/editing/operations";

type BuildDiffPayloadInput = {
  beforeText: string;
  afterText: string;
  appliedOperations: AppliedOperation[];
};

export type ApplyDiffPayload = {
  beforeLength: number;
  afterLength: number;
  deltaLength: number;
  operationCount: number;
  operations: Array<{
    operationId: string;
    opType: AppliedOperation["opType"];
    at: {
      start: number;
      end: number;
    };
    beforeText: string;
    afterText: string;
  }>;
};

export function buildApplyDiffPayload(input: BuildDiffPayloadInput): ApplyDiffPayload {
  return {
    beforeLength: input.beforeText.length,
    afterLength: input.afterText.length,
    deltaLength: input.afterText.length - input.beforeText.length,
    operationCount: input.appliedOperations.length,
    operations: input.appliedOperations.map((operation) => ({
      operationId: operation.operationId,
      opType: operation.opType,
      at: {
        start: operation.matchStart,
        end: operation.matchEnd,
      },
      beforeText: operation.beforeText,
      afterText: operation.afterText,
    })),
  };
}
