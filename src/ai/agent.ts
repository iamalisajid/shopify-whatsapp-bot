import { Type, type Content, type FunctionDeclaration } from "@google/genai";
import { gemini } from "./gemini.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

export type AgentToolCall =
  | { name: "replyToCustomer"; args: { text: string } }
  | { name: "confirmOrder"; args: Record<string, never> }
  | { name: "escalateToHuman"; args: { reason: string } }
  | { name: "sendProductImages"; args: Record<string, never> };

export type AgentTurnInput = {
  systemContext: string;
  history: Array<{ role: "user" | "model"; text: string }>;
  customerMessage: string;
};

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "replyToCustomer",
    description:
      "Send a free-form text reply to the customer over WhatsApp. Use this for greetings, answering questions you can confidently answer from the order context, or asking for clarification. Match the customer's language. Keep replies under ~600 characters.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: "The plain-text WhatsApp reply to send to the customer.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "confirmOrder",
    description:
      "Mark the order(s) on this conversation as confirmed by the customer. Call this only when the customer has clearly agreed to confirm — e.g. they typed 'yes', 'confirm', or tapped the Confirm button. Tags the order in Shopify and tells the customer.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "escalateToHuman",
    description:
      "Pause the AI on this conversation and alert a human agent. Use when: the customer explicitly asks for a human, the question is outside what you can answer from order context, the customer is frustrated, or you'd need to make a refund/exchange decision. Provide a short reason.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: "Short reason a human is needed (max ~120 chars).",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "sendProductImages",
    description:
      "Send the customer photos of every product on their order. Use when they ask 'what does it look like', 'send me a photo', or seem unsure which item they bought.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

const SYSTEM_PROMPT = `You are a helpful WhatsApp assistant for a Shopify store. You are NOT a generic chatbot — you can ONLY help with the specific order being discussed in this conversation.

Behaviour rules:
- Always reply through one of the provided functions. Do not write plain prose responses.
- Default to replyToCustomer for normal conversation. Match the customer's language.
- Call confirmOrder the moment the customer clearly agrees (yes / ok / sure / confirm / 👍).
- Call escalateToHuman if: the customer asks for a human, asks for a refund / exchange / cancellation, is upset, asks something unrelated to the order, asks to change shipping address (since that requires merchant action), or asks anything you can't answer with high confidence from the order context provided.
- Call sendProductImages when the customer asks what an item looks like or wants photos.
- Keep responses friendly, short, and emoji-free unless the customer used emojis first.
- Never invent order details, prices, ETAs, refund policies, or anything not in the order context.
- Never reveal that you are an AI unless directly asked.`;

export async function runAgent(input: AgentTurnInput): Promise<AgentToolCall> {
  const contents: Content[] = [];

  for (const turn of input.history) {
    contents.push({ role: turn.role, parts: [{ text: turn.text }] });
  }
  contents.push({ role: "user", parts: [{ text: input.customerMessage }] });

  const response = await gemini().models.generateContent({
    model: config.GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: `${SYSTEM_PROMPT}\n\n=== ORDER CONTEXT ===\n${input.systemContext}`,
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      temperature: 0.3,
    },
  });

  const calls = response.functionCalls;
  if (calls && calls.length > 0) {
    const call = calls[0]!;
    const args = (call.args ?? {}) as Record<string, unknown>;

    switch (call.name) {
      case "replyToCustomer":
        return {
          name: "replyToCustomer",
          args: { text: String(args.text ?? "") },
        };
      case "confirmOrder":
        return { name: "confirmOrder", args: {} };
      case "escalateToHuman":
        return {
          name: "escalateToHuman",
          args: { reason: String(args.reason ?? "Unknown") },
        };
      case "sendProductImages":
        return { name: "sendProductImages", args: {} };
      default:
        logger.warn({ name: call.name }, "unknown function call from gemini");
    }
  }

  // Fallback: no tool was called. Echo any free text Gemini produced; if even
  // that is missing, escalate to a human so the customer is never left silent.
  const text = response.text?.trim();
  if (text) {
    return { name: "replyToCustomer", args: { text } };
  }
  return {
    name: "escalateToHuman",
    args: { reason: "AI returned no tool call and no text" },
  };
}
