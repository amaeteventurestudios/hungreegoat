"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@hungreegoat/studio-ui/components/card";
import { Input } from "@hungreegoat/studio-ui/components/input";
import { Label } from "@hungreegoat/studio-ui/components/label";
export default function Login() {
 const { session, login } = useSession(); const router = useRouter();
 const [error, setError] = useState<string | null>(null); const [busy,setBusy] = useState(false);
 useEffect(() => { if (session?.authenticated) router.replace("/"); }, [session,router]);
 async function submit(event: React.SubmitEvent<HTMLFormElement>) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true);setError(null);
  try { await login(String(data.get("email")),String(data.get("password"))); form.reset(); router.replace("/"); }
  catch (error) { setError(error instanceof Error ? error.message : "Sign in failed. Please try again."); }
  finally { setBusy(false); }
 }
 return <main className="grid min-h-screen place-items-center px-5 py-12"><div className="w-full max-w-sm"><div className="mb-8 flex items-center justify-center gap-3"><AudioLines className="size-8" /><span className="text-sm font-bold tracking-wider">HUNGREE GOAT</span></div><Card><CardHeader><CardTitle><h1 className="text-2xl">Welcome back</h1></CardTitle><CardDescription>Sign in to your private music studio.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="username" required /></div><div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button className="w-full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button></form><p className="mt-6 text-xs leading-relaxed text-muted-foreground">Access is invitation-only. Contact your workspace owner if you need an account.</p></CardContent></Card></div></main>;
}
