import { z } from "zod";

export const workspaceModeSchema = z.enum(["Ask", "Plan", "Edit", "Compare"]);

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const createDocumentSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1).max(240),
  originalFilename: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().nonnegative(),
  storageKey: z.string().trim().min(1).max(1024),
  checksum: z.string().trim().max(256).optional(),
});

export const chatRequestSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  mode: workspaceModeSchema.default("Ask"),
  threadId: z.string().optional(),
  selectedDocumentIds: z.array(z.string().min(1)).max(50).optional().default([]),
});

export type WorkspaceMode = z.infer<typeof workspaceModeSchema>;
