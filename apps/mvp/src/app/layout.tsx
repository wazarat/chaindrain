import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chaindrain — Threat Detection",
  description:
    "Predictive threat detection for crypto protocols — risk score, dependency fan-out, and signal alerts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
