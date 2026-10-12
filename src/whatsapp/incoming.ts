import { prisma } from "../db.js";
import { logger } from "../lib/logger.js";
import { inboxBus, notifyHumanNeeded } from "../lib/notify.js";
import { runAgent } from "../ai/agent.js";
import { confirmConversationOrders } from "../orders/confirm.js";
import { classifyIntent } from "./intents.js";
import { markRead, sendImage, sendText } from "./client.js";
import type { LineItemSummary } from "../shopify/types.js";

export type IncomingMessage =
  | (BaseIncoming & { kind: "text"; text: string })
  | (BaseIncoming & { kind: "button"; text: string; payload: string })
  | (BaseIncoming & {
      kind: "media";
      mediaType: string;
      mediaId: string;
      caption: string;
    });

type BaseIncoming = {
  waMessageId: string;
  from: string;
  contactName: string | null;
  timestamp: number;
};

const HISTORY_LIMIT = 12;

export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const dedup = await prisma.message.findUnique({ where: { waMessageId: msg.waMessageId } });
  if (dedup) {
    logger.debug({ waMessageId: msg.waMessageId }, "duplicate inbound, skipping");
    return;
  }

  const conversation = await prisma.conversation.upsert({
    where: { customerPhone: msg.from },
    update: {
      customerName: msg.contactName ?? undefined,
      lastMessageAt: new Date(msg.timestamp),
    },
    create: {
      customerPhone: msg.from,
      customerName: msg.contactName,
      status: "NEW",
      lastMessageAt: new Date(msg.timestamp),
    },
  });

  const bodyText =
    msg.kind === "text"
      ? msg.text
      : msg.kind === "button"
        ? `[button] ${msg.text}`
        : `[${msg.mediaType}] ${msg.caption}`.trim();

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "IN",
      sender: "CUSTOMER",
      body: bodyText,
      waMessageId: msg.waMessageId,
    },
  });

  inboxBus.emit({ type: "message", payload: { conversationId: conversation.id } });

  // Best-effort: tell Meta we read it.
  markRead(msg.waMessageId).catch(() => {});

  // If a human is steering this conversation, AI stays silent. The /inbox UI
  // will get the message via SSE and the human can reply manually.
  if (conversation.aiPaused) {
    logger.debug({ conversationId: conversation.id }, "ai paused, skipping auto-reply");
    return;
  }

  // ---- Fast paths via deterministic intent classification ----
  const intent =
    msg.kind === "button"
      ? classifyIntent({ text: msg.text, buttonPayload: msg.payload })
      : msg.kind === "text"
        ? classifyIntent({ text: msg.text })
        : "UNKNOWN";

  if (intent === "CONFIRM") {
    await doConfirm(conversation.id, msg.from);
    return;
  }
  if (intent === "REQUEST_HUMAN") {
    await doEscalate(conversation.id, msg.from, "Customer asked for a human");
    return;
  }

  // ---- AI agent path ----
  const ctx = await buildOrderContext(conversation.id);
  if (!ctx.hasOrder) {
    // No matching order — most likely a stranger pinging the WABA number. Keep
    // it polite but route to a human; we don't want the AI making up store info.
    await doEscalate(
      conversation.id,
      msg.from,
      "Inbound message with no associated order on file",
    );
    return;
  }

  const history = await loadHistory(conversation.id);
  let toolCall;
  try {
    toolCall = await runAgent({
      systemContext: ctx.text,
      history,
      customerMessage: msg.kind === "media" ? `[${msg.mediaType}] ${msg.caption}` : bodyText,
    });
  } catch (err) {
    logger.error({ err, conversationId: conversation.id }, "AI agent threw");
    await doEscalate(conversation.id, msg.from, "AI error");
    return;
  }

  switch (toolCall.name) {
    case "replyToCustomer": {
      const text = toolCall.args.text || "Sorry, I didn't catch that. Could you rephrase?";
      await sendCustomerText(conversation.id, msg.from, text, "AI");
      return;
    }
    case "confirmOrder": {
      await doConfirm(conversation.id, msg.from);
      return;
    }
    case "escalateToHuman": {
      await doEscalate(conversation.id, msg.from, toolCall.args.reason || "AI escalation");
      return;
    }
    case "sendProductImages": {
      await sendOrderImages(conversation.id, msg.from);
      return;
    }
  }
}

async function doConfirm(conversationId: string, to: string): Promise<void> {
  const confirmed = await confirmConversationOrders(conversationId);
  const reply =
    confirmed.length > 0
      ? `Thanks! Your order ${confirmed.join(", ")} is confirmed and we'll start preparing it.`
      : `Your order is already marked as confirmed — thanks!`;
  await sendCustomerText(conversationId, to, reply, "SYSTEM");
}

async function doEscalate(
  conversationId: string,
  to: string,
  reason: string,
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "NEEDS_HUMAN", aiPaused: true },
  });

  await ensureLabel("Needs Human", "#ef4444", conversationId);

  await sendCustomerText(
    conversationId,
    to,
    "Thanks for reaching out — a human teammate will be with you shortly.",
    "SYSTEM",
  );

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  await notifyHumanNeeded({
    conversationId,
    customerPhone: conv?.customerPhone ?? to,
    customerName: conv?.customerName ?? null,
    reason,
    preview: conv?.messages[0]?.body,
  });
}

async function sendOrderImages(conversationId: string, to: string): Promise<void> {
  const orders = await prisma.order.findMany({ where: { conversationId } });
  let sent = 0;
  for (const order of orders) {
    let items: LineItemSummary[] = [];
    try {
      items = JSON.parse(order.lineItems) as LineItemSummary[];
    } catch {
      continue;
    }
    for (const it of items) {
      if (!it.image) continue;
      try {
        const wa = await sendImage({
          to,
          imageUrl: it.image,
          caption: `${it.quantity}× ${it.title}`,
        });
        await prisma.message.create({
          data: {
            conversationId,
            direction: "OUT",
            sender: "AI",
            body: `[image] ${it.quantity}× ${it.title}`,
            mediaUrl: it.image,
            waMessageId: wa.messages[0]?.id,
          },
        });
        sent++;
      } catch (err) {
        logger.warn({ err, image: it.image }, "failed to send product image");
      }
    }
  }
  if (sent === 0) {
    await sendCustomerText(
      conversationId,
      to,
      "Sorry, I don't have product images on file for this order.",
      "AI",
    );
  }
}

async function sendCustomerText(
  conversationId: string,
  to: string,
  text: string,
  sender: "AI" | "HUMAN" | "SYSTEM",
): Promise<void> {
  try {
    const res = await sendText({ to, body: text });
    await prisma.message.create({
      data: {
        conversationId,
        direction: "OUT",
        sender,
        body: text,
        waMessageId: res.messages[0]?.id,
      },
    });
    inboxBus.emit({ type: "message", payload: { conversationId } });
  } catch (err) {
    logger.error({ err, to }, "failed to send WA text");
    await prisma.message.create({
      data: {
        conversationId,
        direction: "OUT",
        sender: "SYSTEM",
        body: `[failed to send] ${text}`,
      },
    });
  }
}

async function ensureLabel(
  name: string,
  color: string,
  conversationId: string,
): Promise<void> {
  const label = await prisma.label.upsert({
    where: { name },
    update: {},
    create: { name, color },
  });
  await prisma.conversationLabel.upsert({
    where: { conversationId_labelId: { conversationId, labelId: label.id } },
    update: {},
    create: { conversationId, labelId: label.id },
  });
}

async function loadHistory(
  conversationId: string,
): Promise<Array<{ role: "user" | "model"; text: string }>> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  return rows
    .reverse()
    .filter((r) => r.body && r.body.length > 0)
    .map((r) => ({
      role: r.direction === "IN" ? ("user" as const) : ("model" as const),
      text: r.body,
    }));
}

async function buildOrderContext(
  conversationId: string,
): Promise<{ hasOrder: boolean; text: string }> {
  const orders = await prisma.order.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
  });
  if (orders.length === 0) return { hasOrder: false, text: "(no orders on file)" };

  const lines: string[] = [];
  for (const o of orders) {
    let items: LineItemSummary[] = [];
    try {
      items = JSON.parse(o.lineItems) as LineItemSummary[];
    } catch {
      // ignore
    }
    lines.push(
      `Order ${o.shopifyOrderName} — ${o.currency} ${o.totalPrice}` +
        (o.confirmedAt ? " [CONFIRMED]" : " [awaiting confirmation]"),
    );
    for (const it of items) {
      lines.push(`  • ${it.quantity}× ${it.title} (${it.price})`);
    }
  }
  return { hasOrder: true, text: lines.join("\n") };
}
