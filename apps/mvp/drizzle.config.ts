import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_SESSION;
if (!url) {
  throw new Error(
    "DATABASE_URL_SESSION is not set (use the session-mode pooler URL on port 5432)",
  );
}

export default defineConfig({
  dialect: "postgresql",
  out: "src/lib/db",
  schema: "src/lib/db/schema.ts",
  schemaFilter: ["chaindrain"],
  introspect: {
    casing: "preserve",
  },
  dbCredentials: {
    url,
  },
});
