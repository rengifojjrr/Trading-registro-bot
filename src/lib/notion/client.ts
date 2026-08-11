import { Client } from "@notionhq/client";

import { serverEnv } from "@/lib/env";

let cached: Client | null = null;

/** Throws if NOTION_API_TOKEN isn't configured -- callers must check `isNotionConfigured()` first if they need to no-op gracefully instead. */
export function getNotionClient(): Client {
  if (cached) return cached;
  const env = serverEnv();
  if (!env.NOTION_API_TOKEN) {
    throw new Error("NOTION_API_TOKEN no está configurado.");
  }
  cached = new Client({ auth: env.NOTION_API_TOKEN });
  return cached;
}

export function isNotionConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.NOTION_API_TOKEN && env.NOTION_DATABASE_ID);
}
