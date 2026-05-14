"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function WatchButton({
  companyId,
  initiallyWatched,
}: {
  companyId: string;
  initiallyWatched: boolean;
}) {
  const router = useRouter();
  const [watched, setWatched] = useState(initiallyWatched);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const next = !watched;
    setWatched(next);
    startTransition(async () => {
      if (next) {
        const { error: err } = await supabase
          .from("watchlists")
          .upsert(
            { user_id: user.id, company_id: companyId },
            { onConflict: "user_id,company_id" },
          );
        if (err) {
          setError(err.message);
          setWatched(false);
          return;
        }
      } else {
        const { error: err } = await supabase
          .from("watchlists")
          .delete()
          .eq("user_id", user.id)
          .eq("company_id", companyId);
        if (err) {
          setError(err.message);
          setWatched(true);
          return;
        }
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={watched ? "default" : "outline"}
        size="sm"
        onClick={toggle}
        disabled={pending}
      >
        <Star className={watched ? "h-4 w-4 fill-current" : "h-4 w-4"} />
        {watched ? "Watching" : "Watch"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
