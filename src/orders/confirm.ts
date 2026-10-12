import { prisma } from "../db.js";
import { logger } from "../lib/logger.js";
import { addTagsToResource } from "../shopify/admin.js";
import { inboxBus } from "../lib/notify.js";

export const ORDER_CONFIRMED_TAG = "wa-confirmed";

/**
 * Mark every un-confirmed order on a conversation as confirmed: tag it in
 * Shopify and persist `confirmedAt`. Idempotent.
 *
 * Returns the list of order names that were freshly confirmed (empty if all
 * were already confirmed).
 */
export async function confirmConversationOrders(
  conversationId: string,
): Promise<string[]> {
  const orders = await prisma.order.findMany({
    where: { conversationId, confirmedAt: null },
  });

  const confirmedNames: string[] = [];
  for (const order of orders) {
    try {
      await addTagsToResource(order.shopifyOrderGid, [ORDER_CONFIRMED_TAG]);
      await prisma.order.update({
        where: { id: order.id },
        data: { confirmedAt: new Date() },
      });
      confirmedNames.push(order.shopifyOrderName);
    } catch (err) {
      logger.error(
        { err, orderId: order.shopifyOrderId },
        "failed to tag order in Shopify",
      );
    }
  }

  if (confirmedNames.length > 0) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "CONFIRMED" },
    });
    inboxBus.emit({
      type: "status",
      payload: { conversationId, status: "CONFIRMED" },
    });
  }

  return confirmedNames;
}
