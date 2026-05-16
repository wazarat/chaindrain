import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

declare global {
  var __chaindrainPg: ReturnType<typeof postgres> | undefined;
}

function getPg() {
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set (use the transaction-mode pooler URL on port 6543)",
    );
  }
  if (!global.__chaindrainPg) {
    global.__chaindrainPg = postgres(url, {
      prepare: false,
      max: 1,
      idle_timeout: 4,
      connect_timeout: 10,
      max_lifetime: 60 * 5,
      connection: {
        application_name: "chaindrain-mvp",
      },
    });
  }
  return global.__chaindrainPg;
}

export const sql = getPg();
export const db = drizzle(sql, { schema });

export async function closeDb(): Promise<void> {
  if (global.__chaindrainPg) {
    await global.__chaindrainPg.end({ timeout: 5 });
    global.__chaindrainPg = undefined;
  }
}
