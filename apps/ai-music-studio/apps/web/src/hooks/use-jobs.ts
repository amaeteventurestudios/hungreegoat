"use client";
import { useCallback,useEffect,useState } from "react";
import type { StudioJob } from "@hungreegoat/studio-contracts";
import { jobs,activeJob } from "@/lib/job-client";
export function useJobs({project,song,state}:{project?:string;song?:string;state?:string}={}) {
 const key=`${project??""}:${song??""}:${state??""}`;
 const [snapshot,setSnapshot]=useState<{key:string;items:StudioJob[];error:string|null;offline:boolean}|null>(null);
 const [refreshIndex,setRefreshIndex]=useState(0);
 const refresh=useCallback(()=>setRefreshIndex(value=>value+1),[]);
 useEffect(()=>{
  let mounted=true;let timer:ReturnType<typeof setTimeout>|undefined;let controller:AbortController|undefined;
  async function poll(){
   if(!mounted)return;
   if(!navigator.onLine){setSnapshot(previous=>({key,items:previous?.key===key?previous.items:[],error:null,offline:true}));return;}
   controller?.abort();const currentController=new AbortController();controller=currentController;let delay=10000;
   try{const result=await jobs.list({project,song,state},currentController.signal);if(!mounted)return;setSnapshot({key,items:result.items,error:null,offline:false});if(result.items.some(activeJob))delay=2000;}
   catch(error){if(!mounted||currentController.signal.aborted)return;setSnapshot(previous=>({key,items:previous?.key===key?previous.items:[],error:error instanceof Error?error.message:"Job activity is unavailable.",offline:false}));}
   if(mounted)timer=setTimeout(()=>void poll(),delay);
  }
  function onConnection(){if(timer)clearTimeout(timer);controller?.abort();void poll();}
  void poll();window.addEventListener("online",onConnection);window.addEventListener("offline",onConnection);
  return()=>{mounted=false;if(timer)clearTimeout(timer);controller?.abort();window.removeEventListener("online",onConnection);window.removeEventListener("offline",onConnection);};
 },[key,project,song,state,refreshIndex]);
 const current=snapshot?.key===key?snapshot:null;
 return {items:current?.items??[],error:current?.error??null,offline:current?.offline??false,loading:current===null,refresh};
}
