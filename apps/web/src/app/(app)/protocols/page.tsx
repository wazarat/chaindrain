import Link from "next/link";
import { Search, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  sector?: string;
}

export default async function ProtocolsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, sector } = await searchParams;
  const supabase = createClient();

  const [{ data: sectors }, { data: companies }] = await Promise.all([
    supabase.from("sectors").select("id, slug, name").order("name"),
    (() => {
      let query = supabase
        .from("companies")
        .select("id, slug, name, chains, tags, subsector_id, subsectors(name, sectors(slug, name))")
        .order("name")
        .limit(120);
      if (q) query = query.ilike("name", `%${q}%`);
      return query;
    })(),
  ]);

  const sectorFiltered = sector
    ? (companies ?? []).filter((c: any) => c.subsectors?.sectors?.slug === sector)
    : companies ?? [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const watched = user
    ? await supabase.from("watchlists").select("company_id").eq("user_id", user.id)
    : { data: [] as { company_id: string }[] };
  const watchedIds = new Set((watched.data ?? []).map((w) => w.company_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Protocols</h1>
        <p className="text-sm text-muted-foreground">
          {sectorFiltered.length} of {(companies ?? []).length} companies
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q ?? ""} placeholder="Search by name…" className="pl-9" />
        </div>
        <select
          name="sector"
          defaultValue={sector ?? ""}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All sectors</option>
          {(sectors ?? []).map((s: any) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90">
          Filter
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sectorFiltered.map((c: any) => (
          <Link key={c.id} href={`/protocols/${c.slug}`}>
            <Card className="h-full transition-colors hover:border-accent">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.subsectors?.sectors?.name} · {c.subsectors?.name}
                    </p>
                  </div>
                  {watchedIds.has(c.id) && <Star className="h-4 w-4 fill-accent text-accent" />}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(c.chains ?? []).slice(0, 4).map((chain: string) => (
                    <Badge key={chain} variant="outline" className="font-mono">
                      {chain}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {sectorFiltered.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No protocols match. Try clearing the filter.
        </div>
      )}
    </div>
  );
}
