import Link from "next/link";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  active: "dashboard" | "methodology" | "alerts" | "exposure";
}

const NAV: Array<{
  id: SiteHeaderProps["active"];
  label: string;
  href: string;
  badge?: string;
}> = [
  { id: "dashboard", label: "Risk dashboard", href: "/" },
  { id: "alerts", label: "Alerts", href: "/alerts" },
  { id: "exposure", label: "Exposure Graph", href: "/exposure", badge: "Preview" },
  { id: "methodology", label: "Methodology", href: "/methodology" },
];

export function SiteHeader({ active }: SiteHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="inline-flex items-baseline text-2xl font-semibold tracking-tight"
            aria-label="chaindrain home"
          >
            <span className="lowercase text-yellow-500 dark:text-yellow-400">
              chain
            </span>
            <span className="lowercase text-red-600 dark:text-red-500">
              drain
            </span>
          </Link>
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            MVP
          </span>
        </div>
        <nav className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {NAV.map((item) => {
            const isActive = item.id === active;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                )}
              >
                {item.label}
                {item.badge ? (
                  <span className="rounded-full bg-teal-700/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-teal-700 dark:text-teal-300">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
