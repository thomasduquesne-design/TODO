import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type StreamlineRuntime = typeof globalThis & {
  __STREAMLINE_DB__?: D1Database;
};

function getBinding() {
  return (globalThis as StreamlineRuntime).__STREAMLINE_DB__;
}

export function getDb() {
  const binding = getBinding();
  if (!binding) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(binding, { schema });
}

export async function ensureSchema() {
  const binding = getBinding();
  if (!binding) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  await binding.prepare(`
    CREATE TABLE IF NOT EXISTS streams (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      title TEXT NOT NULL,
      owner TEXT NOT NULL,
      due_date TEXT NOT NULL,
      progress INTEGER DEFAULT 0 NOT NULL,
      prompt TEXT DEFAULT '' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `).run();
}
