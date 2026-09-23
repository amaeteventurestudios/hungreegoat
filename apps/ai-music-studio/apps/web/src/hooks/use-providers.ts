"use client";
import { useCallback, useEffect, useState } from "react";
import type { ProviderConfig, ProviderModels, ProviderHealthResult } from "@hungreegoat/studio-contracts";
import { apiRequest } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
export function useProviders(onMutation?: () => Promise<void>) {
 const {session}=useSession();const [providers,setProviders]=useState<ProviderConfig[]|null>(null);const [error,setError]=useState<string|null>(null);
 const reload=useCallback(()=>apiRequest<{items:ProviderConfig[]}>("/settings/providers").then(result=>{setProviders(result.items);setError(null);}).catch(error=>{setError(error instanceof Error?error.message:"Unable to load providers.");}),[]);
 useEffect(()=>{void reload();},[reload]);
 async function mutate(provider:string,suffix:string,method:string,body?:unknown,onSaved?:()=>void) {
  await apiRequest<unknown>(`/settings/providers/${encodeURIComponent(provider)}${suffix}`,{method,body,csrf:session?.csrf_token});
  onSaved?.();
  await reload();
  await onMutation?.();
 }
 return {providers,error,reload,
  update:(provider:string,body:{enabled?:boolean;default_model?:string|null})=>mutate(provider,"","PATCH",body),
  credential:(provider:string,apiKey:string,onSaved?:()=>void)=>mutate(provider,"/credential","PUT",{api_key:apiKey},onSaved),
  removeCredential:(provider:string)=>mutate(provider,"/credential","DELETE"),
  test:async(provider:string)=>{const result=await apiRequest<ProviderHealthResult>(`/settings/providers/${encodeURIComponent(provider)}/health-check`,{method:"POST",csrf:session?.csrf_token});await reload();return result;},
  models:(provider:string)=>apiRequest<ProviderModels>(`/settings/providers/${encodeURIComponent(provider)}/models`),
 };
}
export type ProviderActions=ReturnType<typeof useProviders>;
