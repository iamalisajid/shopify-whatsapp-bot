import { Hono } from "hono";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { verifyMetaSignature } from "../lib/crypto.js";
import { handleIncomingMessage, type IncomingMessage } from "./incoming.js";

export const whatsappWebhookRoutes = new Hono();

// GET: webhook subscription verification handshake.
whatsappWebhookRoutes.get("/", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN && challenge) {
    return c.text(challenge, 200);
  }
  return c.text("forbidden", 403);
});

// POST: real message / status events.
whatsappWebhookRoutes.post("/", async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, sig, config.WHATSAPP_APP_SECRET)) {
    logger.warn("rejected whatsapp webhook: bad signature");
    return c.text("invalid signature", 401);
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return c.text("bad request", 400);
  }

  // Acknowledge first; process async so retries don't fire on slow downstreams.
  setImmediate(() => {
    routePayload(payload).catch((err) => {
      logger.error({ err }, "whatsapp webhook processing failed");
    });
  });

  return c.text("ok", 200);
});

async function routePayload(payload: WhatsAppWebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      // Status-only updates (sent / delivered / read / failed). Not strictly
      // required for MVP, but log so we notice failed sends.
      if (value.statuses) {
        for (const s of value.statuses) {
          if (s.status === "failed") {
            logger.warn({ status: s }, "whatsapp message failed");
          } else {
            logger.debug({ msgId: s.id, status: s.status }, "whatsapp delivery status");
          }
        }
      }

      if (value.messages) {
        const contactsByWaId = new Map<string, string>();
        for (const ct of value.contacts ?? []) {
          if (ct.wa_id && ct.profile?.name) {
            contactsByWaId.set(ct.wa_id, ct.profile.name);
          }
        }
        for (const msg of value.messages) {
          const parsed = parseIncoming(msg, contactsByWaId.get(msg.from) ?? null);
          if (parsed) {
            try {
              await handleIncomingMessage(parsed);
            } catch (err) {
              logger.error({ err, msgId: msg.id }, "handleIncomingMessage failed");
            }
          }
        }
      }
    }
  }
}

function parseIncoming(
  msg: WhatsAppInbound,
  contactName: string | null,
): IncomingMessage | null {
  const base = {
    waMessageId: msg.id,
    from: msg.from,
    contactName,
    timestamp: Number(msg.timestamp) * 1000,
  };

  switch (msg.type) {
    case "text":
      return { ...base, kind: "text", text: msg.text?.body ?? "" };
    case "button":
      return {
        ...base,
        kind: "button",
        text: msg.button?.text ?? "",
        payload: msg.button?.payload ?? "",
      };
    case "interactive": {
      const i = msg.interactive;
      if (i?.type === "button_reply" && i.button_reply) {
        return {
          ...base,
          kind: "button",
          text: i.button_reply.title,
          payload: i.button_reply.id,
        };
      }
      if (i?.type === "list_reply" && i.list_reply) {
        return {
          ...base,
          kind: "button",
          text: i.list_reply.title,
          payload: i.list_reply.id,
        };
      }
      return null;
    }
    case "image":
    case "audio":
    case "video":
    case "document":
    case "sticker": {
      const media = (msg as MediaInbound)[msg.type] as
        | { id?: string; caption?: string }
        | undefined;
      return {
        ...base,
        kind: "media",
        mediaType: msg.type,
        mediaId: media?.id ?? "",
        caption: media?.caption ?? "",
      };
    }
    default:
      logger.debug({ type: msg.type }, "ignoring unsupported wa message type");
      return null;
  }
}

// ---------------------------------------------------------------------------
// Loose webhook payload types (Meta's shape; we only type what we read).
// ---------------------------------------------------------------------------

type WhatsAppWebhookPayload = {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value?: {
        messaging_product?: "whatsapp";
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: WhatsAppInbound[];
        statuses?: Array<{
          id: string;
          recipient_id: string;
          status: "sent" | "delivered" | "read" | "failed";
          errors?: Array<{ code: number; title: string; message?: string }>;
        }>;
      };
    }>;
  }>;
};

type WhatsAppInbound = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string; payload: string };
  interactive?: {
    type: "button_reply" | "list_reply" | string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; caption?: string; filename?: string };
  sticker?: { id: string; mime_type?: string };
};

type MediaInbound = WhatsAppInbound & Record<string, { id?: string; caption?: string } | undefined>;
