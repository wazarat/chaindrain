import { sql as raw } from "drizzle-orm";
import { db } from "./index";
import { identityInChaindrain } from "./schema";

export async function countIdentities(): Promise<number> {
  const rows = await db
    .select({ count: raw<string>`count(*)` })
    .from(identityInChaindrain);
  return Number(rows[0]?.count ?? 0);
}
