import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { streamSSE } from "hono/streaming";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { logger } from "../lib/logger.js";
import { inboxBus } from "../lib/notify.js";
import { sendText } from "../whatsapp/client.js";
import {
  layout,
  renderMessages,
  type ConversationListItem,
  type FilterId,
} from "./views.js";
import type { ConversationStatus, Prisma } from "@prisma/client";

export const inboxRoutes = new Hono();

inboxRoutes.use(
  "*",
  basicAuth({ username: config.INBOX_USERNAME, password: config.INBOX_PASSWORD }),
);

const FILTER_TO_WHERE: Record<FilterId, Prisma.ConversationWhereInput> = {
  needs_human: { status: "NEEDS_HUMAN" },
  awaiting: { status: { in: ["NEW", "AWAITING_CONFIRMATION"] } },
  confirmed: { status: "CONFIRMED" },
  all: {},
};

function parseFilter(raw: string | undefined): FilterId {
  if (raw && raw in FILTER_TO_WHERE) return raw as FilterId;
  return "needs_human";
}

inboxRoutes.get("/", async (c) => {
  const filter = parseFilter(c.req.query("filter"));
  const conversations = (await prisma.conversation.findMany({
    where: FILTER_TO_WHERE[filter],
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      labels: { include: { label: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  })) as ConversationListItem[];

  return c.html(layout({ filter, conversations }));
});

inboxRoutes.get("/events", async (c) => {
  return streamSSE(c, async (stream) => {
    const unsubscribe = inboxBus.subscribe((event) => {
      stream
        .writeSSE({ event: event.type, data: JSON.stringify(event.payload) })
        .catch(() => {
          // best-effort: client may be disconnected
        });
    });
    stream.onAbort(() => unsubscribe());

    // keepalive every 25s
    while (true) {
      await stream.sleep(25_000);
      try {
        await stream.writeSSE({ event: "ping", data: "1" });
      } catch {
        break;
      }
    }
  });
});

inboxRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const filter = parseFilter(c.req.query("filter"));
  const detail = await prisma.conversation.findUnique({
    where: { id },
    include: {
      labels: { include: { label: true } },
      messages: { orderBy: { createdAt: "asc" } },
      orders: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!detail) return c.notFound();

  const conversations = (await prisma.conversation.findMany({
    where: FILTER_TO_WHERE[filter],
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      labels: { include: { label: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  })) as ConversationListItem[];

  return c.html(
    layout({ filter, conversations, selectedId: id, detail }),
  );
});

inboxRoutes.get("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
  });
  return c.html(renderMessages(messages));
});

inboxRoutes.post("/:id/reply", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return c.redirect(`/inbox/${id}`, 302);

  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv) return c.notFound();

  try {
    const res = await sendText({ to: conv.customerPhone, body });
    await prisma.message.create({
      data: {
        conversationId: id,
        direction: "OUT",
        sender: "HUMAN",
        body,
        waMessageId: res.messages[0]?.id,
      },
    });
    // Once a human writes back, AI stays out of the way until explicitly resumed.
    await prisma.conversation.update({
      where: { id },
      data: { aiPaused: true, lastMessageAt: new Date() },
    });
    inboxBus.emit({ type: "message", payload: { conversationId: id } });
  } catch (err) {
    logger.error({ err, id }, "human reply failed");
    await prisma.message.create({
      data: {
        conversationId: id,
        direction: "OUT",
        sender: "SYSTEM",
        body: `[failed to send: ${(err as Error).message}] ${body}`,
      },
    });
  }

  return c.redirect(`/inbox/${id}`, 302);
});

inboxRoutes.post("/:id/pause-ai", async (c) => {
  const id = c.req.param("id");
  await prisma.conversation.update({ where: { id }, data: { aiPaused: true } });
  return c.redirect(`/inbox/${id}`, 302);
});

inboxRoutes.post("/:id/resume-ai", async (c) => {
  const id = c.req.param("id");
  await prisma.conversation.update({ where: { id }, data: { aiPaused: false } });
  return c.redirect(`/inbox/${id}`, 302);
});

inboxRoutes.post("/:id/resolve", async (c) => {
  const id = c.req.param("id");
  await prisma.conversation.update({
    where: { id },
    data: { status: "RESOLVED" satisfies ConversationStatus, aiPaused: true },
  });
  return c.redirect(`/inbox/${id}`, 302);
});
