interface DemoChipProps {
  confidence: string | null | undefined;
}

export function DemoChip({ confidence }: DemoChipProps) {
  if (!confidence) return null;
  const up = confidence.toUpperCase();
  if (up === "HIGH" || up === "MEDIUM") return null;
  const label = up === "DEMO" ? "Demo" : "Inferred";
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 ring-1 ring-amber-500/40 dark:text-amber-300">
      {label}
    </span>
  );
}
