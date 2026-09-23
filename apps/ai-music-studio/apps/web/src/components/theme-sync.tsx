"use client";
import { useEffect } from "react";
import type { StudioSettings } from "@hungreegoat/studio-contracts";
import { apiRequest } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
export function ThemeSync() {
 const {session} = useSession();
 useEffect(() => {
  if(!session?.authenticated) {document.documentElement.classList.remove("dark");return;}
  let active=true;let theme: "light"|"dark"|"system"="light";
  const query=window.matchMedia("(prefers-color-scheme: dark)");
  const apply=()=> {if(active)document.documentElement.classList.toggle("dark",theme==="dark"||(theme==="system"&&query.matches));};
  const sync=()=> {void apiRequest<StudioSettings>("/settings").then(value=>{theme=value.appearance.theme;apply();}).catch(()=>{ console.error("studio_theme_settings_unavailable"); });};
  sync();query.addEventListener("change",apply);window.addEventListener("studio:settings-updated",sync);
  return()=>{active=false;query.removeEventListener("change",apply);window.removeEventListener("studio:settings-updated",sync);};
 },[session?.authenticated]);
 return null;
}
