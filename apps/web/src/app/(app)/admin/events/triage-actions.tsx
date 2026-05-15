"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Props = {
  eventId: string;
  currentStatus: string;
};

const TERMINAL = new Set(["confirmed", "retracted"]);

export function TriageActions({ eventId, currentStatus }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const disabled = TERMINAL.has(currentStatus) || pending;

  function patch(status: "confirmed" | "retracted") {
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
      const res = await fetch(`${base}/events/${eventId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const text = await res.text();
        setMsg(`HTTP ${res.status}: ${text.slice(0, 160)}`);
        return;
      }
      setMsg(`OK · ${status}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => patch("confirmed")}
          disabled={disabled}
        >
          <Check className="h-3.5 w-3.5" />
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => patch("retracted")}
          disabled={disabled}
        >
          <X className="h-3.5 w-3.5" />
          Retract
        </Button>
      </div>
      {msg && <p className="font-mono text-[10px] text-muted-foreground">{msg}</p>}
    </div>
  );
}
