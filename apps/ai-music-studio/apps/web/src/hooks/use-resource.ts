"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function useResource<T>(key:string,loader:()=>Promise<T>) {
 const loaderRef=useRef(loader);useEffect(()=>{loaderRef.current=loader;},[loader]);
 const [result,setResult]=useState<{key:string;data:T|null;error:string|null}>({key:"",data:null,error:null});
 const reload=useCallback(()=>loaderRef.current().then(data=>{setResult({key,data,error:null});}).catch(error=>{setResult({key,data:null,error:error instanceof Error?error.message:"The workspace could not be loaded."});}),[key]);
 useEffect(()=>{let active=true;void loaderRef.current().then(data=>{if(active)setResult({key,data,error:null});}).catch(error=>{if(active)setResult({key,data:null,error:error instanceof Error?error.message:"The workspace could not be loaded."});});return()=>{active=false;};},[key]);
 return {data:result.key===key?result.data:null,error:result.key===key?result.error:null,loading:result.key!==key,reload};
}
