import { config } from "../config.js";
import { sendTemplate } from "./client.js";
import type { LineItemSummary } from "../shopify/types.js";

/**
 * Quick-reply button payloads. We pre-fix all bot-emitted payloads with `WA_`
 * so the inbound webhook can recognize them deterministically and skip the AI.
 */
export const BUTTON_PAYLOADS = {
  confirm: "WA_CONFIRM_ORDER",
  question: "WA_HAS_QUESTION",
} as const;

export type OrderTemplateInput = {
  to: string;
  customerFirstName: string;
  orderName: string;
  totalDisplay: string;
  itemSummary: string;
  headerImageUrl?: string;
};

/**
 * Send the `order_confirmation_v1` template. Merchants must submit a matching
 * UTILITY template in WhatsApp Manager. See README + the spec below.
 */
export async function sendOrderConfirmationTemplate(input: OrderTemplateInput) {
  return sendTemplate({
    to: input.to,
    templateName: config.WHATSAPP_TEMPLATE_NAME,
    language: config.WHATSAPP_TEMPLATE_LANGUAGE,
    headerImageUrl: input.headerImageUrl,
    bodyParams: [
      input.customerFirstName,
      input.orderName,
      input.totalDisplay,
      input.itemSummary,
    ],
    buttons: [
      { index: 0, payload: BUTTON_PAYLOADS.confirm },
      { index: 1, payload: BUTTON_PAYLOADS.question },
    ],
  });
}

export function buildItemSummaryText(items: LineItemSummary[], maxItems = 5): string {
  const lines = items.slice(0, maxItems).map((it) => `• ${it.quantity}× ${it.title}`);
  if (items.length > maxItems) {
    lines.push(`…and ${items.length - maxItems} more item(s)`);
  }
  return lines.join("\n");
}

/**
 * The exact template you must submit in WhatsApp Manager → Message Templates.
 *
 * Name: order_confirmation_v1
 * Category: UTILITY
 * Language: English (en)
 *
 * Header: Media → Image
 *
 * Body:
 *   Hi {{1}}, thanks for your order {{2}}!
 *
 *   Total: {{3}}
 *
 *   {{4}}
 *
 *   Please confirm your order or let us know if you have any questions.
 *
 * Body sample values for approval:
 *   {{1}} = Sara
 *   {{2}} = #1042
 *   {{3}} = $79.00
 *   {{4}} = • 1× Cotton T-Shirt (Medium)\n• 2× Coffee Mug
 *
 * Buttons (Quick reply):
 *   1) Confirm order
 *   2) I have a question
 *
 * Footer (optional): "Reply STOP to opt out"
 *
 * NOTE: Quick-reply button payloads are NOT defined in the template — they are
 * supplied at send time (see BUTTON_PAYLOADS above) and echoed back to us in
 * the inbound webhook as `interactive.button_reply.id` (or in older webhooks
 * as `button.payload`). The webhook handler matches both.
 */
export const TEMPLATE_SPEC_DOC = "see comment in src/whatsapp/templates.ts";
