// Supabase Edge Function: cron-trigger
// Scheduled (via supabase/cron-jobs.sql or pg_cron) to fire daily at 13:00 UTC.
// Calls the chaindrain-agent Fly.io app's /run endpoint with an HMAC-signed
// JSON body. The agent runs the job asynchronously and writes to agent_runs.
//
// Required secrets (set with `supabase secrets set ...`):
//   AGENT_RUN_URL      = https://chaindrain-agent.fly.dev/run
//   AGENT_HMAC_SECRET  = <shared secret with the agent>

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

async function hmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (_req: Request) => {
  const url = Deno.env.get("AGENT_RUN_URL");
  const secret = Deno.env.get("AGENT_HMAC_SECRET");
  if (!url || !secret) {
    return new Response(JSON.stringify({ error: "missing AGENT_RUN_URL or AGENT_HMAC_SECRET" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const body = JSON.stringify({ trigger: "cron", at: new Date().toISOString() });
  const signature = await hmac(secret, body);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-chaindrain-signature": signature,
      "x-chaindrain-trigger": "cron",
    },
    body,
  });

  return new Response(
    JSON.stringify({ status: resp.status, ok: resp.ok }),
    { status: resp.ok ? 200 : 502, headers: { "content-type": "application/json" } },
  );
});
