import Link from "next/link";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  active: "dashboard" | "alerts";
  legSubtitle?: string;
}

const NAV: Array<{ id: SiteHeaderProps["active"]; label: string; href: string }> = [
  { id: "dashboard", label: "Risk dashboard", href: "/" },
  { id: "alerts", label: "Alerts", href: "/alerts" },
];

export function SiteHeader({ active, legSubtitle }: SiteHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-white dark:bg-white dark:text-zinc-900">
            Chaindrain
          </span>
          {legSubtitle ? (
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              {legSubtitle}
            </span>
          ) : null}
        </div>
        <nav className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {NAV.map((item) => {
            const isActive = item.id === active;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
