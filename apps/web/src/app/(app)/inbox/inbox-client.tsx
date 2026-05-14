"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Severity } from "@chaindrain/shared-types";

interface Notif {
  id: string;
  kind: "watched_company_event" | "sector_signal" | "system";
  read_at: string | null;
  created_at: string;
  event_id: string | null;
  sector_signal_id: string | null;
  events?: {
    id: string;
    title: string;
    severity: Severity;
    evidence_class: string;
    primary_company_id: string;
    companies?: { slug: string; name: string } | null;
  } | null;
  sector_signals?: {
    id: string;
    severity: Severity;
    rationale: string;
    subsectors?: { slug: string; name: string } | null;
  } | null;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "company", label: "Watchlist" },
  { key: "sector", label: "Sector signals" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export function InboxClient({ initial, userId }: { initial: Notif[]; userId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>(initial);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [groupByCompany, setGroupByCompany] = useState(false);

  // Realtime: subscribe to new notifications
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (filter === "unread") return !n.read_at;
      if (filter === "company") return n.kind === "watched_company_event";
      if (filter === "sector") return n.kind === "sector_signal";
      return true;
    });
  }, [items, filter]);

  const grouped = useMemo(() => {
    if (!groupByCompany) return null;
    const map = new Map<string, Notif[]>();
    filtered.forEach((n) => {
      const key = n.events?.companies?.name ?? n.sector_signals?.subsectors?.name ?? "Other";
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    });
    return [...map.entries()];
  }, [filtered, groupByCompany]);

  async function markAllRead() {
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    router.refresh();
  }

  async function markOneRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2 py-1 text-xs ${
                filter === f.key ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGroupByCompany((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {groupByCompany ? "Ungroup" : "Group by company"}
          </button>
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            <Check className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {filtered.length === 0 && (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Bell className="h-4 w-4" />
            No notifications yet.
          </div>
        )}

        {grouped
          ? grouped.map(([groupKey, list]) => (
              <div key={groupKey}>
                <div className="bg-muted/40 px-4 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                  {groupKey}
                </div>
                {list.map((n) => (
                  <NotifRow key={n.id} n={n} onRead={markOneRead} />
                ))}
              </div>
            ))
          : filtered.map((n) => <NotifRow key={n.id} n={n} onRead={markOneRead} />)}
      </div>
    </div>
  );
}

function NotifRow({ n, onRead }: { n: Notif; onRead: (id: string) => void }) {
  const event = n.events;
  const signal = n.sector_signals;
  const sev = event?.severity ?? signal?.severity ?? "info";
  const title =
    event?.title ?? (signal ? `Sector signal: ${signal.subsectors?.name ?? ""}` : "Notification");
  const sub =
    event?.companies?.name ??
    signal?.rationale ??
    (n.kind === "system" ? "System" : "");

  const href = event?.companies?.slug
    ? `/protocols/${event.companies.slug}`
    : "/threat-matrix";

  return (
    <div
      className={`flex items-center gap-3 p-4 ${n.read_at ? "" : "bg-accent/5"}`}
      onClick={() => !n.read_at && onRead(n.id)}
    >
      <Badge variant={sev as Severity}>{sev}</Badge>
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-sm font-medium hover:underline">
          {title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <time className="font-mono text-xs text-muted-foreground">
        {new Date(n.created_at).toLocaleString()}
      </time>
      {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
    </div>
  );
}
