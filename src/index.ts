import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { shopifyWebhookRoutes } from "./shopify/webhook.js";
import { whatsappWebhookRoutes } from "./whatsapp/webhook.js";
import { inboxRoutes } from "./inbox/routes.js";

const app = new Hono();

app.get("/", (c) =>
  c.text(
    `shopify-wa is running.\n\n` +
      `- POST /webhooks/shopify/orders-create\n` +
      `- GET/POST /webhooks/whatsapp\n` +
      `- /inbox (basic auth)\n`,
  ),
);

app.get("/healthz", (c) => c.json({ ok: true }));

app.route("/webhooks/shopify", shopifyWebhookRoutes);
app.route("/webhooks/whatsapp", whatsappWebhookRoutes);
app.route("/inbox", inboxRoutes);

app.onError((err, c) => {
  // Let framework-thrown HTTPExceptions (basic-auth 401, etc.) pass through
  // with their intended status and headers (e.g. WWW-Authenticate).
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  logger.error({ err, path: c.req.path }, "unhandled error");
  return c.text("internal error", 500);
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info(
    { port: info.port, env: config.NODE_ENV, publicBaseUrl: config.PUBLIC_BASE_URL },
    "shopify-wa listening",
  );
});
