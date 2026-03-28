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

const ROLE_LABELS: Record<string, string> = {
  MAIN_AGREEMENT: "Main Agreement (editable)",
  EXHIBIT: "Exhibit (editable)",
  REFERENCE: "Reference (read-only context)",
};

function formatChunksForPrompt(chunks: RankedChunk[]): string {
  return chunks
    .map(
      (chunk, index) =>
        `[Chunk ${index + 1}]
Document: ${chunk.documentTitle}
Role: ${ROLE_LABELS[chunk.documentRole] ?? chunk.documentRole}
documentId: ${chunk.documentId}
versionId: ${chunk.versionId}
chunkId: ${chunk.chunkId}
Section: ${chunk.headingPath.length > 0 ? chunk.headingPath.join(" > ") : "General"}
---
${chunk.text}`,
    )
    .join("\n\n");
}

export async function callGeminiAsk(
  question: string,
  chunks: RankedChunk[],
): Promise<AskModeResponse> {
  const chunkContext = formatChunksForPrompt(chunks);

  const systemInstruction = `You are a senior contract attorney. Answer questions about contracts with precision and authority.

Your response MUST be valid JSON matching this exact structure:
{
  "answer": "<your answer as a markdown-formatted string>",
  "citations": [
    {
      "documentId": "<exact documentId from the chunk>",
      "versionId": "<exact versionId from the chunk>",
      "chunkId": "<exact chunkId from the chunk>",
      "snippet": "<a short relevant quote from the chunk text, max 240 characters>"
    }
  ]
}

Response guidelines:
- Be direct and concise. Answer in 2-4 sentences unless the question genuinely requires more detail.
- Use **bold** for key legal terms and defined terms.
- Use bullet points only when listing multiple distinct items.
- Do not add unsolicited analysis, headings, blockquotes, or "Practical Recommendation" sections.

Citation rules:
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

export async function* streamGeminiAsk(
  question: string,
  chunks: RankedChunk[],
): AsyncGenerator<string, string> {
  const chunkContext = formatChunksForPrompt(chunks);

  const systemInstruction = `You are a senior contract attorney. Answer questions about contracts with precision and authority.

Be direct and concise. Answer in 2-4 sentences unless the question genuinely requires more detail. Use **bold** for key legal terms and defined terms. Use bullet points only when listing multiple distinct items. Do not add unsolicited analysis, headings, blockquotes, or extra sections.`;

  const userPrompt = `Document excerpts:\n\n${chunkContext}\n\nQuestion: ${question}`;

  const response = await gemini.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: { systemInstruction },
  });

  let accumulated = "";
  for await (const chunk of response) {
    const text = chunk.text ?? "";
    if (text) {
      accumulated += text;
      yield text;
    }
  }
  return accumulated;
}

export async function callGeminiPlan(
  request: string,
  chunks: RankedChunk[],
): Promise<PlanModeResponse> {
  const chunkContext = formatChunksForPrompt(chunks);

  const systemInstruction = `You are a senior contract review specialist. Create a prioritized review plan identifying the most critical legal and business risks.

Your response MUST be valid JSON matching this exact structure:
{
  "summary": "<one sentence overview of the plan>",
  "items": [
    {
      "id": "plan_1",
      "issue": "<concise description with **bold** key terms>",
      "whyItMatters": "<1-2 sentences on the concrete legal or business risk>",
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

Review approach:
- Focus on the most critical issues. Limit to 5-7 items unless the request demands more.
- Assign priority: **high** = material exposure or liability, **medium** = suboptimal protections or ambiguities, **low** = minor drafting improvements.
- Cross-reference between documents for inconsistencies.
- Use sequential ids: plan_1, plan_2, etc.

Citation rules:
- Only use documentId, versionId, and chunkId values that appear verbatim in the provided chunks.
- Each item must cite at least one chunk.
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
  chunks: RankedChunk[],
): Promise<EditModeResponse> {
  const chunkContext = formatChunksForPrompt(chunks);

  const systemInstruction = `You are a senior contract drafting and redlining specialist. Propose precise, targeted text edits that reduce legal risk, improve clarity, or strengthen protections.

Your response MUST be valid JSON matching this exact structure:
{
  "proposals": [
    {
      "title": "<short title for the edit proposal>",
      "rationale": "<1-2 sentences: what risk this edit mitigates or what it improves>",
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

Editing guidelines:
- Each proposal should focus on a single logical change or closely related set of changes.
- Use professional contract drafting conventions ("shall" for obligations, "may" for permissions, defined terms in title case).

Operational rules:
- Only use documentId, versionId, and chunkId values that appear verbatim in the provided chunks.
- For replace_text operations, findText must be at least 8 characters and must exist in the chunk text.
- Each proposal's operations must target a chunk that appears in that proposal's citations.
- Each proposal must have at least one operation and at least one citation.
- Do not invent or paraphrase IDs.
- NEVER target documents with Role "Reference (read-only context)" for edit operations. All operations must target Main Agreement or Exhibit documents.`;

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
