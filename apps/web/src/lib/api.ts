import { createClient } from "@/lib/supabase/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { withAuth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("content-type", "application/json");
  if (init.withAuth !== false) {
    const token = await getAccessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${path}: ${text}`);
  }
  return (await res.json()) as T;
}
