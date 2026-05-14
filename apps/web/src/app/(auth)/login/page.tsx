"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function onMagicLink() {
    setError(null);
    if (!email) {
      setError("Enter your email first");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (err) setError(err.message);
    else setMagicSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2">
          <Link href="/" className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-4 w-4 text-accent" />
            chaindrain
          </Link>
          <CardTitle className="text-xl">Log in</CardTitle>
          <CardDescription>Use email + password or a magic link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onPassword} className="space-y-3">
            <Input
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            {magicSent && (
              <p className="text-sm text-accent">Check your email for the magic link.</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "…" : "Log in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onMagicLink}
              disabled={loading}
            >
              Send magic link instead
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            New here?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
