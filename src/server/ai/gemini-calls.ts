import { gemini, GEMINI_MODEL } from "@/src/lib/gemini";
import {
  askModeResponseSchema,
  planModeResponseSchema,
  editModeResponseSchema,
  type AskModeResponse,
  type PlanModeResponse,
  type EditModeResponse,
} from "@/src/server/ai/schemas";
import type { RankedChunk } from "@/src/server/retrieval/rank-chunks";

function formatChunksForPrompt(chunks: RankedChunk[]): string {
  return chunks
    .map(
      (chunk, index) =>
        `[Chunk ${index + 1}]
Document: ${chunk.documentTitle}
documentId: ${chunk.documentId}
versionId: ${chunk.versionId}
chunkId: ${chunk.chunkId}
Section: ${chunk.headingPath.length > 0 ? chunk.headingPath.join(" > ") : "General"}
---
${chunk.text}`
    )
    .join("\n\n");
}

export async function callGeminiAsk(
  question: string,
  chunks: RankedChunk[]
): Promise<AskModeResponse> {
  const chunkContext = formatChunksForPrompt(chunks);

  const systemInstruction = `You are a legal document assistant that answers questions strictly based on provided document excerpts.
Your response MUST be valid JSON matching this exact structure:
{
  "answer": "<your answer as a string>",
  "citations": [
    {
      "documentId": "<exact documentId from the chunk>",
      "versionId": "<exact versionId from the chunk>",
      "chunkId": "<exact chunkId from the chunk>",
      "snippet": "<a short relevant quote from the chunk text, max 240 characters>"
    }
  ]
}
Rules:
- Only use documentId, versionId, and chunkId values that appear verbatim in the provided chunks.
- Cite only the chunks that directly support your answer.
- If no chunks are relevant, return an empty citations array and explain in the answer.
- Do not invent or paraphrase IDs.`;

  const userPrompt = `Document excerpts:\n\n${chunkContext}\n\nQuestion: ${question}`;

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    },
  });

  const raw = JSON.parse(response.text ?? "{}");
  return askModeResponseSchema.parse(raw);
}

export async function callGeminiPlan(
  request: string,
  chunks: RankedChunk[]
): Promise<PlanModeResponse> {
  const chunkContext = formatChunksForPrompt(chunks);

  const systemInstruction = `You are a contract review specialist that creates harmonization and risk review plans based on document excerpts.
Your response MUST be valid JSON matching this exact structure:
{
  "summary": "<one to two sentence overview of the plan>",
  "items": [
    {
      "id": "plan_1",
      "issue": "<description of the specific issue or inconsistency found>",
      "whyItMatters": "<explanation of the legal or business risk>",
      "priority": "<one of: low, medium, high>",
      "citations": [
        {
          "documentId": "<exact documentId from the chunk>",
          "versionId": "<exact versionId from the chunk>",
          "chunkId": "<exact chunkId from the chunk>",
          "snippet": "<a short relevant quote from the chunk text, max 240 characters>"
        }
      ]
    }
  ]
}
Rules:
- Use sequential ids: plan_1, plan_2, etc.
- Only use documentId, versionId, and chunkId values that appear verbatim in the provided chunks.
- Each item must cite at least one chunk.
- Assign priority based on legal/business risk severity.
- Do not invent or paraphrase IDs.`;

  const userPrompt = `Document excerpts:\n\n${chunkContext}\n\nReview request: ${request}`;

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    },
  });

  const raw = JSON.parse(response.text ?? "{}");
  return planModeResponseSchema.parse(raw);
}

export async function callGeminiEdit(
  instruction: string,
  chunks: RankedChunk[]
): Promise<EditModeResponse> {
  const chunkContext = formatChunksForPrompt(chunks);

  const systemInstruction = `You are a contract editing specialist that proposes precise, targeted text edits based on document excerpts.
Your response MUST be valid JSON matching this exact structure:
{
  "proposals": [
    {
      "title": "<short title for the edit proposal>",
      "rationale": "<explanation of why this edit improves the contract>",
      "citations": [
        {
          "documentId": "<exact documentId from the chunk>",
          "versionId": "<exact versionId from the chunk>",
          "chunkId": "<exact chunkId from the chunk>",
          "snippet": "<a short relevant quote from the chunk text, max 240 characters>"
        }
      ],
      "operations": [
        {
          "opType": "<one of: replace_text, insert_before, insert_after>",
          "target": {
            "documentId": "<exact documentId from the chunk>",
            "versionId": "<exact versionId from the chunk>",
            "chunkId": "<exact chunkId from the chunk>",
            "headingPath": ["<heading>"]
          },
          "findText": "<for replace_text: the exact text to find, min 8 characters>",
          "replaceText": "<for replace_text: the improved replacement text>",
          "insertText": "<for insert_before or insert_after: the text to insert>"
        }
      ]
    }
  ]
}
Rules:
- Only use documentId, versionId, and chunkId values that appear verbatim in the provided chunks.
- For replace_text operations, findText must be at least 8 characters and must exist in the chunk text.
- Each proposal's operations must target a chunk that appears in that proposal's citations.
- Each proposal must have at least one operation and at least one citation.
- Do not invent or paraphrase IDs.`;

  const userPrompt = `Document excerpts:\n\n${chunkContext}\n\nEdit instruction: ${instruction}`;

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    },
  });

  const raw = JSON.parse(response.text ?? "{}");
  return editModeResponseSchema.parse(raw);
}
