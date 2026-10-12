import { BUTTON_PAYLOADS } from "./templates.js";

export type Intent = "CONFIRM" | "DECLINE" | "REQUEST_HUMAN" | "UNKNOWN";

const CONFIRM_RX = /^(yes|y|confirm|ok|okay|sure|yep|yup|👍|✅)\.?$/i;
const DECLINE_RX = /^(no|n|nope|cancel|stop|❌)\.?$/i;
const HUMAN_RX = /(talk to (a )?(human|agent|person)|human( please)?|real person|live agent|customer (service|support))/i;

/**
 * Determine intent from a normalized inbound message. Pass:
 *   - text: typed message (or empty string)
 *   - buttonPayload: payload string from a quick-reply button tap, if any
 */
export function classifyIntent(args: {
  text: string;
  buttonPayload?: string | null;
}): Intent {
  if (args.buttonPayload) {
    if (args.buttonPayload === BUTTON_PAYLOADS.confirm) return "CONFIRM";
    if (args.buttonPayload === BUTTON_PAYLOADS.question) return "REQUEST_HUMAN";
  }
  const t = args.text.trim();
  if (!t) return "UNKNOWN";
  if (CONFIRM_RX.test(t)) return "CONFIRM";
  if (DECLINE_RX.test(t)) return "DECLINE";
  if (HUMAN_RX.test(t)) return "REQUEST_HUMAN";
  return "UNKNOWN";
}
