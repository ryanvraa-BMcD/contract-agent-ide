import { z } from "zod";

export const askCitationSchema = z.object({
  documentId: z.string().min(1),
  versionId: z.string().min(1),
  chunkId: z.string().min(1),
  snippet: z.string().min(1),
});

export const askModeResponseSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(askCitationSchema),
});

export const planPrioritySchema = z.enum(["low", "medium", "high"]);

export const planItemSchema = z.object({
  id: z.string().min(1),
  issue: z.string().min(1),
  whyItMatters: z.string().min(1),
  priority: planPrioritySchema,
  citations: z.array(askCitationSchema),
});

export const planModeResponseSchema = z.object({
  summary: z.string().min(1),
  items: z.array(planItemSchema),
});

export const editOperationTypeSchema = z.enum(["replace_text", "insert_before", "insert_after"]);

export const editTargetLocatorSchema = z.object({
  documentId: z.string().min(1),
  versionId: z.string().min(1),
  chunkId: z.string().min(1),
  headingPath: z.array(z.string()).optional(),
});

export const editOperationSchema = z.object({
  opType: editOperationTypeSchema,
  target: editTargetLocatorSchema,
  findText: z.string().optional(),
  replaceText: z.string().optional(),
  insertText: z.string().optional(),
});

export const editProposalSchema = z.object({
  title: z.string().min(1),
  rationale: z.string().min(1),
  citations: z.array(askCitationSchema),
  operations: z.array(editOperationSchema).min(1),
});

export const editModeResponseSchema = z.object({
  proposals: z.array(editProposalSchema),
});

export type AskCitation = z.infer<typeof askCitationSchema>;
export type AskModeResponse = z.infer<typeof askModeResponseSchema>;
export type PlanModeResponse = z.infer<typeof planModeResponseSchema>;
export type EditModeResponse = z.infer<typeof editModeResponseSchema>;
