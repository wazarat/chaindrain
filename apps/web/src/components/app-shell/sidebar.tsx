"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, Grid3x3, LayoutDashboard, Settings, Shield } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/protocols", label: "Protocols", icon: Shield },
  { href: "/threat-matrix", label: "Threat Matrix", icon: Grid3x3 },
  { href: "/inbox", label: "Inbox", icon: Bell },
  { href: "/admin", label: "Admin", icon: Settings, adminOnly: true },
];

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Activity className="h-5 w-5 text-accent" />
        <span className="font-mono text-sm font-semibold tracking-tight">chaindrain</span>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground font-mono">
        v0.1.0 · {process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local"}
      </div>
    </aside>
  );
}
