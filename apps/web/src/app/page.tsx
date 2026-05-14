import Link from "next/link";
import { Activity, ArrowRight, Bell, Grid3x3, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-accent" />
            <span className="font-mono text-sm font-semibold tracking-tight">chaindrain</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">
                Get access
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="container py-24 md:py-32">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Exploit Intelligence</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Daily exploit signal across <span className="text-accent">500+</span> crypto protocols.
        </h1>
        <p className="mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
          A Comet-driven agent reads the open web every day, classifies what matters, and
          surfaces sector-level threat signals before they hit your watchlist.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/signup">Start watching</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/threat-matrix">Live threat matrix</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-border bg-card/40">
        <div className="container grid gap-6 py-16 md:grid-cols-3">
          {[
            {
              icon: Shield,
              title: "Watch protocols",
              body: "Star the protocols you depend on; we surface every credible exploit, governance attack, or operational compromise.",
            },
            {
              icon: Grid3x3,
              title: "Sector threat matrix",
              body: "Heatmap of evidence-class × subsector — a 30-day rolling, recency-weighted score across the whole market.",
            },
            {
              icon: Bell,
              title: "Real-time inbox",
              body: "Realtime alerts via Supabase Realtime: in-app within 30s of a watched-protocol event.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-border p-6">
              <Icon className="h-5 w-5 text-accent" />
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="container flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Chaindrain</span>
          <span className="font-mono">v0.1.0</span>
        </div>
      </footer>
    </main>
  );
}
