import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

let cached: GoogleGenAI | undefined;

export function gemini(): GoogleGenAI {
  if (!cached) {
    cached = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
  return cached;
}
