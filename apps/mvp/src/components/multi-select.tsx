"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  label: string;
  placeholder?: string;
  options: string[];
  values: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

export function MultiSelect({
  label,
  placeholder,
  options,
  values,
  onChange,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(value: string) {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const selectedSummary =
    values.length === 0
      ? placeholder ?? "Any"
      : values.length === 1
        ? values[0]
        : `${values.length} selected`;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 text-left text-sm shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800",
          values.length > 0 && "border-blue-400 dark:border-blue-500/60",
        )}
      >
        <span
          className={cn(
            "truncate",
            values.length === 0 && "text-zinc-500 dark:text-zinc-400",
          )}
        >
          {selectedSummary}
        </span>
        <span className="flex items-center gap-1">
          {values.length > 0 ? (
            <X
              role="button"
              tabIndex={0}
              onClick={clearAll}
              className="h-4 w-4 cursor-pointer text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            />
          ) : null}
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {options.length > 8 ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full border-b border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700"
            />
          ) : null}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-zinc-500">
                No matches
              </div>
            ) : (
              filtered.map((option) => {
                const checked = values.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
                      checked && "bg-blue-50 dark:bg-blue-500/10",
                    )}
                  >
                    <span className="truncate">{option}</span>
                    {checked ? (
                      <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
