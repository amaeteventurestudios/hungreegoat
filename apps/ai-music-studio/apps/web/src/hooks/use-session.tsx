"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { StudioSession } from "@hungreegoat/studio-contracts";
import { apiRequest } from "@/lib/api-client";
interface SessionContextValue {
  session: StudioSession | null; loading: boolean; error: string | null;
  reload: () => Promise<void>; login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>; changePassword: (current: string, next: string) => Promise<void>;
}
const SessionContext = createContext<SessionContextValue | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StudioSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => apiRequest<StudioSession>("/auth/session")
    .then(value => { setSession(value); setError(null); })
    .catch(error => { setError(error instanceof Error ? error.message : "Unable to restore your session."); })
    .finally(() => setLoading(false)), []);
  useEffect(() => {
    void reload();
    const onExpired = () => { setSession(null); void reload(); };
    window.addEventListener("studio:session-expired", onExpired);
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    return () => { window.removeEventListener("studio:session-expired", onExpired); window.removeEventListener("online", reload); window.removeEventListener("focus", reload); };
  }, [reload]);
  async function login(email: string, password: string) { setSession(await apiRequest<StudioSession>("/auth/login", { method: "POST", body: { email, password } })); setError(null); }
  async function logout() { await apiRequest<void>("/auth/logout", { method: "POST", csrf: session?.csrf_token }); setSession(null); await reload(); }
  async function changePassword(current: string, next: string) { await apiRequest<void>("/auth/password", { method: "POST", csrf: session?.csrf_token, body: { current_password: current, new_password: next } }); setSession(null); await reload(); }
  return <SessionContext.Provider value={{ session, loading, error, reload, login, logout, changePassword }}>{children}</SessionContext.Provider>;
}
export function useSession() { const context = useContext(SessionContext); if (!context) throw new Error("SessionProvider is required"); return context; }
