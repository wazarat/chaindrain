"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Activity, Bell, Grid3x3, LayoutDashboard, Search, Shield } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STATIC_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Protocols", href: "/protocols", icon: Shield },
  { label: "Threat Matrix", href: "/threat-matrix", icon: Grid3x3 },
  { label: "Inbox", href: "/inbox", icon: Bell },
];

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[15vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <Command
        loop
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className={cn(
          "w-full max-w-xl overflow-hidden rounded-lg border border-border bg-card shadow-xl",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search events, protocols, sectors…"
            className="flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-1">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            {query.length > 1 ? `Press Enter to search “${query}”` : "Type to search…"}
          </Command.Empty>
          {query.length > 1 && (
            <Command.Item
              value={`__search__${query}`}
              onSelect={() => go(`/protocols?q=${encodeURIComponent(query)}`)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
            >
              <Activity className="h-4 w-4 text-accent" />
              Search for &quot;{query}&quot;
            </Command.Item>
          )}
          <Command.Group heading="Navigate" className="text-xs text-muted-foreground">
            {STATIC_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item
                  key={item.href}
                  value={item.label}
                  onSelect={() => go(item.href)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-muted"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Command.Item>
              );
            })}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
