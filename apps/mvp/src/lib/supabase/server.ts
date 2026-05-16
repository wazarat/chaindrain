import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function build() {
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(url, serviceRoleKey, {
    db: { schema: "chaindrain" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let cached: ReturnType<typeof build> | null = null;

export function getServerSupabase() {
  if (!cached) {
    cached = build();
  }
  return cached;
}
