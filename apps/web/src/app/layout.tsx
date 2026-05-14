import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chaindrain — exploit intelligence for crypto/web3",
  description:
    "Daily exploit intelligence, sector-level threat matrix, and watchlist alerts for 500+ crypto protocols.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Chaindrain",
    description: "Exploit intelligence for crypto/web3",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">{children}</body>
    </html>
  );
}
