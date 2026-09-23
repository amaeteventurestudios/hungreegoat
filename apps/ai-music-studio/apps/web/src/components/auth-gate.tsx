"use client";
import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { SongProvider } from "@/hooks/use-song-context";
import { ThemeSync } from "@/components/theme-sync";
import { StudioShell } from "@/components/studio-shell";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@hungreegoat/studio-ui/components/card";
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading, error, reload } = useSession();
  const pathname = usePathname(); const router = useRouter();
  useEffect(() => { if (!loading && !error && !session?.authenticated && pathname !== "/login") router.replace("/login"); }, [session, loading, error, pathname, router]);
  if (pathname === "/login") return children;
  if (error) return <main className="mx-auto max-w-lg p-6 pt-24"><Card><CardHeader><CardTitle>Couldn’t reconnect to your studio</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button onClick={() => void reload()}>Retry connection</Button></CardContent></Card></main>;
  if (loading || !session?.authenticated) return <main className="p-12 text-center text-muted-foreground" role="status">Restoring your workspace…</main>;
  return <><ThemeSync /><Suspense fallback={<main className="p-12 text-center text-muted-foreground" role="status">Restoring your song…</main>}><SongProvider><StudioShell>{children}</StudioShell></SongProvider></Suspense></>;
}
