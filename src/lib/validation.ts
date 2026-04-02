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

export const createVersionSchema = z.object({
  richJson: z.unknown().optional(),
  plainText: z.string().optional(),
}).refine((data) => data.richJson !== undefined || data.plainText !== undefined, {
  message: "Either richJson or plainText is required.",
});

const headingStyleSchema = z.object({
  fontSize: z.string(),
  bold: z.boolean(),
});

export const updateStyleSettingsSchema = z.object({
  styleSettings: z.object({
    fontFamily: z.string(),
    fontSize: z.string(),
    lineHeight: z.number(),
    paragraphSpacingAfter: z.number(),
    headings: z.object({
      h1: headingStyleSchema,
      h2: headingStyleSchema,
      h3: headingStyleSchema,
      h4: headingStyleSchema,
      h5: headingStyleSchema,
    }),
    pageMargins: z.object({
      top: z.number(),
      right: z.number(),
      bottom: z.number(),
      left: z.number(),
    }),
  }),
});

export const compileRequestSchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1, "At least one documentId is required."),
});

const orderEntrySchema = z.object({
  id: z.string().trim().min(1, "Each order entry must have a string id."),
  sortOrder: z.number().int("Each order entry must have an integer sortOrder."),
});

export const reorderRequestSchema = z.object({
  orders: z.array(orderEntrySchema),
});

export const applyOperationsSchema = z.object({
  targetVersionId: z.string().trim().min(1, "targetVersionId is required."),
  operationIds: z.array(z.string().min(1)).min(1, "operationIds must be a non-empty array."),
});

export type WorkspaceMode = z.infer<typeof workspaceModeSchema>;
