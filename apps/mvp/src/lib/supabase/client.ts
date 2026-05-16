import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function build() {
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
    );
  }
  return createClient(url, anonKey, {
    db: { schema: "chaindrain" },
  });
}

let cached: ReturnType<typeof build> | null = null;

export function getBrowserSupabase() {
  if (!cached) {
    cached = build();
  }
  return cached;
}
