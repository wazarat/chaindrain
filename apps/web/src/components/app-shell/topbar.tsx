"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/command-palette";
import { createClient } from "@/lib/supabase/client";

export function Topbar({
  email,
  unreadCount,
}: {
  email: string | null;
  unreadCount: number;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/40 px-4">
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex w-72 items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
      >
        <Search className="h-4 w-4" />
        Search events, protocols…
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.push("/inbox")} className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-mono font-semibold text-accent-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
        <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{email ?? "anon"}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
