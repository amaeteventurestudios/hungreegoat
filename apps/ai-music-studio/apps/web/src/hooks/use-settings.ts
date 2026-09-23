"use client";
import { useCallback, useEffect, useState } from "react";
import type { StudioSettings, SystemHealth } from "@hungreegoat/studio-contracts";
import { apiRequest } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
export function useSettings() {
 const { session } = useSession();
 const [settings,setSettings] = useState<StudioSettings|null>(null); const [system,setSystem] = useState<SystemHealth|null>(null);
 const [error,setError] = useState<string|null>(null); const [saving,setSaving] = useState(false);
 const reload = useCallback(() => Promise.all([apiRequest<StudioSettings>("/settings"),apiRequest<SystemHealth>("/settings/system")])
  .then(([next,health]) => {setSettings(next);setSystem(health);setError(null);})
  .catch(error => {setError(error instanceof Error ? error.message : "Settings unavailable.");}),[]);
 useEffect(() => { void reload(); },[reload]);
 async function save(patch: Partial<StudioSettings>) {
  setSaving(true);setError(null);
  try {const next = await apiRequest<StudioSettings>("/settings",{method:"PATCH",csrf:session?.csrf_token,body:patch});setSettings(next);window.dispatchEvent(new Event("studio:settings-updated"));return next;}
  catch(error) {setError(error instanceof Error ? error.message : "Could not save settings.");throw error;}
  finally {setSaving(false);}
 }
 return {settings,system,error,saving,reload,save};
}
