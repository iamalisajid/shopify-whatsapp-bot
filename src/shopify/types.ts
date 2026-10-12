/**
 * Subset of the Shopify orders/create REST webhook payload that we use.
 * The full payload has hundreds of fields — we type only what we read.
 */
export type ShopifyOrderWebhook = {
  id: number;
  admin_graphql_api_id: string; // gid://shopify/Order/<id>
  name: string;                 // "#1042"
  total_price: string;
  currency: string;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  shipping_address?: {
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  billing_address?: {
    phone?: string | null;
  } | null;
  phone?: string | null;
  line_items: Array<{
    id: number;
    title: string;
    name: string;
    quantity: number;
    price: string;
    sku?: string | null;
    variant_title?: string | null;
    image?: { src?: string | null } | null;
    product_id?: number | null;
  }>;
};

export type LineItemSummary = {
  title: string;
  quantity: number;
  price: string;
  image: string | null;
};

export function summarizeLineItems(payload: ShopifyOrderWebhook): LineItemSummary[] {
  return payload.line_items.map((li) => ({
    title: li.variant_title ? `${li.title} (${li.variant_title})` : li.title,
    quantity: li.quantity,
    price: li.price,
    image: li.image?.src ?? null,
  }));
}

export function pickCustomerPhone(payload: ShopifyOrderWebhook): string | null {
  return (
    payload.customer?.phone ??
    payload.shipping_address?.phone ??
    payload.billing_address?.phone ??
    payload.phone ??
    null
  );
}

export function pickCustomerName(payload: ShopifyOrderWebhook): string | null {
  const c = payload.customer;
  if (c) {
    const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    if (full) return full;
  }
  const sa = payload.shipping_address;
  if (sa) {
    const full = sa.name ?? [sa.first_name, sa.last_name].filter(Boolean).join(" ").trim();
    if (full) return full;
  }
  return null;
}
