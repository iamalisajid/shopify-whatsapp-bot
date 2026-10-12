import { Hono } from "hono";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { verifyShopifyHmac } from "../lib/crypto.js";
import { ingestOrder } from "../orders/ingest.js";
import type { ShopifyOrderWebhook } from "./types.js";

export const shopifyWebhookRoutes = new Hono();

shopifyWebhookRoutes.post("/orders-create", async (c) => {
  const rawBody = await c.req.text();
  const hmac = c.req.header("x-shopify-hmac-sha256");

  if (!verifyShopifyHmac(rawBody, hmac, config.SHOPIFY_WEBHOOK_SECRET)) {
    logger.warn(
      { topic: c.req.header("x-shopify-topic"), shop: c.req.header("x-shopify-shop-domain") },
      "rejected shopify webhook: bad HMAC",
    );
    return c.text("invalid signature", 401);
  }

  let payload: ShopifyOrderWebhook;
  try {
    payload = JSON.parse(rawBody) as ShopifyOrderWebhook;
  } catch (err) {
    logger.warn({ err }, "shopify webhook: invalid JSON");
    return c.text("bad request", 400);
  }

  // Acknowledge fast; do real work after the response so Shopify never retries
  // because of a slow downstream (Meta / DB).
  setImmediate(() => {
    ingestOrder(payload).catch((err) => {
      logger.error({ err, orderId: payload.id }, "ingestOrder failed");
    });
  });

  return c.text("ok", 200);
});
