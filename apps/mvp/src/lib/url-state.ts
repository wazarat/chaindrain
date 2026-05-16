export type ParamValue = string | string[] | number | undefined | null;

export function buildSearchString(
  params: Record<string, ParamValue>,
): string {
  const usp = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      usp.set(key, raw.join(","));
    } else {
      usp.set(key, String(raw));
    }
  }
  const s = usp.toString();
  return s.length > 0 ? `?${s}` : "";
}

export function parseList(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
