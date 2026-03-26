import { GoogleGenAI } from "@google/genai";

const globalForGemini = globalThis as unknown as { gemini?: GoogleGenAI };

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not configured.");
}

export const gemini =
  globalForGemini.gemini ?? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

if (process.env.NODE_ENV !== "production") {
  globalForGemini.gemini = gemini;
}

export const GEMINI_MODEL = "gemini-2.0-flash";
