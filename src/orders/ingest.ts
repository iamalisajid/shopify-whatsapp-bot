import { prisma } from "../db.js";
import { logger } from "../lib/logger.js";
import { normalizePhone } from "../lib/crypto.js";
import {
  pickCustomerName,
  pickCustomerPhone,
  summarizeLineItems,
  type ShopifyOrderWebhook,
} from "../shopify/types.js";
import {
  buildItemSummaryText,
  sendOrderConfirmationTemplate,
} from "../whatsapp/templates.js";

/**
 * Idempotently ingest a Shopify orders/create webhook:
 *   - upsert Conversation (keyed on customer phone)
 *   - persist Order
 *   - send the WhatsApp order_confirmation template
 *
 * If the order has no usable phone we still persist it but skip the WA send.
 */
export async function ingestOrder(payload: ShopifyOrderWebhook): Promise<void> {
  const shopifyOrderId = String(payload.id);

  const existing = await prisma.order.findUnique({ where: { shopifyOrderId } });
  if (existing) {
    logger.info({ shopifyOrderId }, "order already ingested, skipping");
    return;
  }

  const phone = normalizePhone(pickCustomerPhone(payload));
  const customerName = pickCustomerName(payload);
  const lineItems = summarizeLineItems(payload);

  if (!phone) {
    logger.warn({ shopifyOrderId, name: payload.name }, "order has no usable phone; persisting only");
    // Park the order under a synthetic conversation keyed by order id so it
    // still shows up in the inbox and can be reassigned later.
    const conv = await prisma.conversation.create({
      data: {
        customerPhone: `unknown:${shopifyOrderId}`,
        customerName,
        status: "NEW",
      },
    });
    await prisma.order.create({
      data: {
        shopifyOrderId,
        shopifyOrderGid: payload.admin_graphql_api_id,
        shopifyOrderName: payload.name,
        conversationId: conv.id,
        totalPrice: payload.total_price,
        currency: payload.currency,
        lineItems: JSON.stringify(lineItems),
        customerPhone: "",
        customerName,
      },
    });
    return;
  }

  const conversation = await prisma.conversation.upsert({
    where: { customerPhone: phone },
    update: {
      customerName: customerName ?? undefined,
      status: "AWAITING_CONFIRMATION",
      lastMessageAt: new Date(),
    },
    create: {
      customerPhone: phone,
      customerName,
      status: "AWAITING_CONFIRMATION",
    },
  });

  await prisma.order.create({
    data: {
      shopifyOrderId,
      shopifyOrderGid: payload.admin_graphql_api_id,
      shopifyOrderName: payload.name,
      conversationId: conversation.id,
      totalPrice: payload.total_price,
      currency: payload.currency,
      lineItems: JSON.stringify(lineItems),
      customerPhone: phone,
      customerName,
    },
  });

  const firstName = (customerName ?? "there").split(/\s+/)[0] ?? "there";
  const totalDisplay = `${payload.currency} ${payload.total_price}`;
  const itemSummary = buildItemSummaryText(lineItems);
  const headerImageUrl = lineItems.find((li) => !!li.image)?.image ?? undefined;

  try {
    const wa = await sendOrderConfirmationTemplate({
      to: phone,
      customerFirstName: firstName,
      orderName: payload.name,
      totalDisplay,
      itemSummary,
      headerImageUrl,
    });

    const waMessageId = wa.messages[0]?.id;
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUT",
        sender: "SYSTEM",
        body: `[order_confirmation_v1] ${payload.name} • ${totalDisplay}\n${itemSummary}`,
        mediaUrl: headerImageUrl ?? null,
        waMessageId,
      },
    });

    logger.info(
      { shopifyOrderId, conversationId: conversation.id, waMessageId },
      "sent order confirmation template",
    );
  } catch (err) {
    logger.error({ err, shopifyOrderId }, "failed to send WhatsApp template");
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUT",
        sender: "SYSTEM",
        body: `[failed to send order_confirmation_v1] ${(err as Error).message}`,
      },
    });
  }
}
