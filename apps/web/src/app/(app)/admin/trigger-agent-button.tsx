"use client";

import { useState, useTransition } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function TriggerAgentButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function trigger() {
    setMsg(null);
    start(async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setMsg("Not signed in");
        return;
      }
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const res = await fetch(`${base}/admin/agent_runs/trigger`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      setMsg(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    });
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={trigger} disabled={pending}>
        <Play className="h-3.5 w-3.5" />
        {pending ? "Triggering…" : "Run agent now"}
      </Button>
      {msg && <p className="text-[11px] text-muted-foreground">{msg}</p>}
    </div>
  );
}
