import { config } from "../config.js";
import { logger } from "../lib/logger.js";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
};

async function adminGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const url = `https://${config.SHOPIFY_SHOP_DOMAIN}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Shopify-Access-Token": config.SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify Admin API ${res.status}: ${text}`);
  }
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors && json.errors.length) {
    throw new Error(`Shopify GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) {
    throw new Error("Shopify GraphQL: empty data");
  }
  return json.data;
}

// Validated against the Admin GraphQL schema via the shopify-admin skill.
const TAGS_ADD_MUTATION = /* GraphQL */ `
  mutation addTags($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type TagsAddResult = {
  tagsAdd: {
    node: { id: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
};

/**
 * Add tags to any taggable resource (Order, Customer, Product, ...).
 *
 * @param resourceGid Shopify GID, e.g. `gid://shopify/Order/12345`
 * @param tags array of tag strings
 */
export async function addTagsToResource(
  resourceGid: string,
  tags: string[],
): Promise<void> {
  const data = await adminGraphQL<TagsAddResult>(TAGS_ADD_MUTATION, {
    id: resourceGid,
    tags,
  });
  const errs = data.tagsAdd.userErrors;
  if (errs && errs.length) {
    throw new Error(
      `tagsAdd userErrors: ${errs.map((e) => `${e.field?.join(".") ?? ""}: ${e.message}`).join("; ")}`,
    );
  }
  logger.info({ resourceGid, tags }, "added tags to resource");
}
