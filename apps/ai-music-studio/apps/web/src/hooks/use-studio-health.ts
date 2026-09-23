"use client";
import { useCallback, useEffect, useState } from "react";
type Health = "checking" | "ready" | "unavailable";
async function checkHealth(signal: AbortSignal): Promise<Health> {
  try {
    const response = await fetch("/api/v1/health/ready", { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
    return response.ok ? "ready" : "unavailable";
  } catch { return "unavailable"; }
}
export function useStudioHealth() {
  const [status, setStatus] = useState<Health>("checking");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void checkHealth(controller.signal).then(result => { if (!controller.signal.aborted) setStatus(result); });
    return () => controller.abort();
  }, [attempt]);
  const refresh = useCallback(() => { setStatus("checking"); setAttempt(value => value + 1); }, []);
  return { status, refresh };
}
