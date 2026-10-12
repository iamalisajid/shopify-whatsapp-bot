import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  PUBLIC_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

  SHOPIFY_SHOP_DOMAIN: z.string().min(1),
  SHOPIFY_ADMIN_TOKEN: z.string().min(1),
  SHOPIFY_WEBHOOK_SECRET: z.string().min(1),
  SHOPIFY_API_VERSION: z.string().default("2025-01"),

  WHATSAPP_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_TEMPLATE_NAME: z.string().default("order_confirmation_v1"),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default("en"),

  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  INBOX_USERNAME: z.string().min(1).default("admin"),
  INBOX_PASSWORD: z.string().min(8),

  SLACK_WEBHOOK_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const config = new Proxy({} as AppConfig, {
  get(_target, prop) {
    return loadConfig()[prop as keyof AppConfig];
  },
});
