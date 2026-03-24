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

export type AskCitation = z.infer<typeof askCitationSchema>;
export type AskModeResponse = z.infer<typeof askModeResponseSchema>;
