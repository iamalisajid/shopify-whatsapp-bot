import { config } from "../config.js";
import { logger } from "./logger.js";

export type HumanNeededEvent = {
  conversationId: string;
  customerPhone: string;
  customerName?: string | null;
  reason?: string;
  preview?: string;
};

/**
 * Central fan-out for "a human is needed" events. Today this only emits
 * an in-process event for the SSE stream and (optionally) posts to Slack.
 *
 * TODO: extend with email / desktop push / PagerDuty / etc. New transports
 * should be added inside this single function so callers stay unchanged.
 */
export async function notifyHumanNeeded(event: HumanNeededEvent): Promise<void> {
  logger.info({ event }, "human takeover requested");

  inboxBus.emit({ type: "human-needed", payload: event });

  if (config.SLACK_WEBHOOK_URL) {
    try {
      const link = `${config.PUBLIC_BASE_URL.replace(/\/$/, "")}/inbox/${event.conversationId}`;
      const text =
        `:rotating_light: *Human needed* in WhatsApp chat with ` +
        `${event.customerName ?? event.customerPhone}` +
        (event.reason ? `\nReason: ${event.reason}` : "") +
        (event.preview ? `\nLast message: ${event.preview}` : "") +
        `\n<${link}|Open conversation>`;
      await fetch(config.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      logger.warn({ err }, "slack notification failed");
    }
  }
}

// ---------------------------------------------------------------------------
// In-process pub/sub used by /inbox SSE stream. Kept tiny on purpose.
// ---------------------------------------------------------------------------

export type InboxEvent =
  | { type: "human-needed"; payload: HumanNeededEvent }
  | { type: "message"; payload: { conversationId: string } }
  | { type: "status"; payload: { conversationId: string; status: string } };

type Listener = (e: InboxEvent) => void;

class InboxBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: InboxEvent): void {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch (err) {
        logger.warn({ err }, "inbox listener threw");
      }
    }
  }
}

export const inboxBus = new InboxBus();
