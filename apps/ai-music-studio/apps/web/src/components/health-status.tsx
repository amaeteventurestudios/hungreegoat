"use client";
import { useEffect, useState } from "react";
import { RefreshCw, CircleCheck, CircleAlert } from "lucide-react";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Badge } from "@hungreegoat/studio-ui/components/badge";
export function HealthStatus() {
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  async function refresh() {
    setStatus("checking");
    try {
      const response = await fetch("/api/v1/health/ready", { cache: "no-store", signal: AbortSignal.timeout(6000) });
      setStatus(response.ok ? "ready" : "unavailable");
    } catch { setStatus("unavailable"); }
  }
  useEffect(() => { void refresh(); }, []);
  return <div className="flex flex-wrap items-center gap-3">
    <Badge variant="outline" aria-live="polite" className="gap-2 px-3 py-2">
      {status === "ready" ? <CircleCheck className="size-4 text-green-700" /> : status === "unavailable" ? <CircleAlert className="size-4 text-amber-700" /> : <RefreshCw className="size-4 animate-spin" />}
      {status === "ready" ? "Studio connected" : status === "checking" ? "Checking Studio connection" : "Studio API unavailable"}
    </Badge>
    <Button variant="ghost" size="sm" onClick={refresh} disabled={status === "checking"}><RefreshCw /> Check connection</Button>
  </div>;
}
