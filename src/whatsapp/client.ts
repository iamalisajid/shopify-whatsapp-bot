import { config } from "../config.js";
import { logger } from "../lib/logger.js";

const GRAPH_VERSION = "v21.0";

function endpoint(path: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

type SendResponse = {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status?: string }>;
};

type ErrorResponse = {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

async function postMessage(body: Record<string, unknown>): Promise<SendResponse> {
  const url = endpoint(`${config.WHATSAPP_PHONE_NUMBER_ID}/messages`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  const text = await res.text();
  if (!res.ok) {
    let parsed: ErrorResponse | undefined;
    try {
      parsed = JSON.parse(text) as ErrorResponse;
    } catch {
      // ignore
    }
    const msg = parsed?.error
      ? `${parsed.error.code} ${parsed.error.type}: ${parsed.error.message}`
      : text;
    throw new Error(`WhatsApp API ${res.status}: ${msg}`);
  }
  return JSON.parse(text) as SendResponse;
}

// ---------------------------------------------------------------------------
// Template message with image header + body variables + 2 quick-reply buttons.
// Merchant must have submitted and gotten approval for a UTILITY template
// matching this shape — see src/whatsapp/templates.ts for the exact spec.
// ---------------------------------------------------------------------------

export type TemplateButton = {
  /** index of the quick-reply button in the template (0-based) */
  index: number;
  /** payload string echoed back to us when the customer taps the button */
  payload: string;
};

export async function sendTemplate(args: {
  to: string;
  templateName: string;
  language: string;
  headerImageUrl?: string;
  bodyParams: string[];
  buttons?: TemplateButton[];
}): Promise<SendResponse> {
  const components: Array<Record<string, unknown>> = [];

  if (args.headerImageUrl) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: args.headerImageUrl } }],
    });
  }

  if (args.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: args.bodyParams.map((text) => ({ type: "text", text })),
    });
  }

  if (args.buttons) {
    for (const b of args.buttons) {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(b.index),
        parameters: [{ type: "payload", payload: b.payload }],
      });
    }
  }

  const body = {
    to: args.to,
    type: "template",
    template: {
      name: args.templateName,
      language: { code: args.language },
      components,
    },
  };

  const res = await postMessage(body);
  logger.debug({ to: args.to, template: args.templateName, msgId: res.messages[0]?.id }, "sent template");
  return res;
}

export async function sendText(args: {
  to: string;
  body: string;
  /** message id to reply to (threads the message) */
  contextMessageId?: string;
  previewUrl?: boolean;
}): Promise<SendResponse> {
  const payload: Record<string, unknown> = {
    to: args.to,
    type: "text",
    text: { body: args.body, preview_url: args.previewUrl ?? false },
  };
  if (args.contextMessageId) payload.context = { message_id: args.contextMessageId };
  const res = await postMessage(payload);
  logger.debug({ to: args.to, msgId: res.messages[0]?.id }, "sent text");
  return res;
}

export async function sendImage(args: {
  to: string;
  imageUrl: string;
  caption?: string;
}): Promise<SendResponse> {
  const res = await postMessage({
    to: args.to,
    type: "image",
    image: { link: args.imageUrl, caption: args.caption },
  });
  logger.debug({ to: args.to, msgId: res.messages[0]?.id }, "sent image");
  return res;
}

export async function markRead(messageId: string): Promise<void> {
  const url = endpoint(`${config.WHATSAPP_PHONE_NUMBER_ID}/messages`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, messageId, body: await res.text() }, "markRead failed");
  }
}

/** Look up the public URL for a media id, then fetch its bytes. */
export async function downloadMedia(
  mediaId: string,
): Promise<{ contentType: string; bytes: Buffer }> {
  const metaRes = await fetch(endpoint(mediaId), {
    headers: { authorization: `Bearer ${config.WHATSAPP_TOKEN}` },
  });
  if (!metaRes.ok) {
    throw new Error(`media metadata ${metaRes.status}: ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url: string; mime_type: string };
  const binRes = await fetch(meta.url, {
    headers: { authorization: `Bearer ${config.WHATSAPP_TOKEN}` },
  });
  if (!binRes.ok) {
    throw new Error(`media download ${binRes.status}`);
  }
  const buf = Buffer.from(await binRes.arrayBuffer());
  return { contentType: meta.mime_type, bytes: buf };
}
