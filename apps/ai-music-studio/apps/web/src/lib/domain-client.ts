import type { StudioProject, StudioSong, AudioAsset, AudioAnalysis, AssetLineage, ArrangementRevision, ArrangementSection, GenerationVersion, MusicGeneration, ProductionPlan, TempoVersion } from "@hungreegoat/studio-contracts";
import { apiRequest, ApiError } from "@/lib/api-client";
export const domain = {
 projects:(query="",offset=0)=>apiRequest<{items:StudioProject[]}>(`/projects?${new URLSearchParams({limit:"100",q:query,offset:String(offset)})}`),
 project:(id:string)=>apiRequest<StudioProject>(`/projects/${encodeURIComponent(id)}`),
 songs:(id:string)=>apiRequest<{items:StudioSong[]}>(`/projects/${encodeURIComponent(id)}/songs?limit=100`),
 song:(id:string)=>apiRequest<StudioSong>(`/songs/${encodeURIComponent(id)}`),
 assets:(project?:string,song?:string,offset=0)=>apiRequest<{items:AudioAsset[]}>(`/assets?${new URLSearchParams({limit:"100",offset:String(offset),...(project?{project_id:project}:{}),...(song?{song_id:song}:{})})}`),
 lineage:(id:string)=>apiRequest<{items:AssetLineage[]}>(`/assets/${encodeURIComponent(id)}/lineage`),
 saveProject:(id:string|null,body:Pick<StudioProject,"name"|"description"|"tags">,csrf:string|null)=>apiRequest<StudioProject>(id?`/projects/${id}`:"/projects",{method:id?"PATCH":"POST",body,csrf}),
 saveSong:(id:string|null,project:string,body:Pick<StudioSong,"title"|"brief"|"style"|"vocal_mode"|"target_duration_seconds"|"notes"|"tags"|"bpm"|"musical_key">,csrf:string|null)=>apiRequest<StudioSong>(id?`/songs/${id}`:`/projects/${project}/songs`,{method:id?"PATCH":"POST",body,csrf}),
 plans:(song:string)=>apiRequest<{items:ProductionPlan[]}>(`/songs/${encodeURIComponent(song)}/production-plans?limit=100`),
 createPlan:(song:string,body:{idempotency_key:string;instructions:string},csrf:string|null)=>apiRequest<{job_id:string;state:string}>(`/songs/${encodeURIComponent(song)}/production-plans`,{method:"POST",body,csrf}),
 generations:(song:string)=>apiRequest<{items:MusicGeneration[]}>(`/songs/${encodeURIComponent(song)}/generations?limit=100`),
 generationVersions:(generation:string)=>apiRequest<{items:GenerationVersion[]}>(`/generations/${encodeURIComponent(generation)}/versions?limit=100`),
 createGeneration:(song:string,body:{idempotency_key:string;version_count:number;duration_seconds?:number;prompt:string},csrf:string|null)=>apiRequest<{generation_id:string;job_id:string;state:string}>(`/songs/${encodeURIComponent(song)}/generations`,{method:"POST",body,csrf}),
 reviewVersion:(id:string,body:Partial<Pick<GenerationVersion,"favorite"|"approved"|"rejected"|"notes">>,csrf:string|null)=>apiRequest<GenerationVersion>(`/generation-versions/${encodeURIComponent(id)}`,{method:"PATCH",body,csrf}),
 arrangements:(version:string)=>apiRequest<{items:ArrangementRevision[]}>(`/generation-versions/${encodeURIComponent(version)}/arrangements?limit=100`),
 createArrangement:(version:string,body:{base_revision:number;sections:ArrangementSection[]},csrf:string|null)=>apiRequest<ArrangementRevision>(`/generation-versions/${encodeURIComponent(version)}/arrangements`,{method:"POST",body,csrf}),
 analysis:(asset:string)=>apiRequest<{items:AudioAnalysis[]}>(`/assets/${encodeURIComponent(asset)}/analysis`),
 requestAnalysis:(asset:string,key:string,csrf:string|null)=>apiRequest<{job_id:string;state:string}>(`/assets/${encodeURIComponent(asset)}/analysis`,{method:"POST",body:{idempotency_key:key},csrf}),
 tempoVersions:(asset:string)=>apiRequest<{items:TempoVersion[]}>(`/assets/${encodeURIComponent(asset)}/tempo-versions`),
 requestTempo:(asset:string,body:{idempotency_key:string;mode:"time_stretch"|"double_time"|"half_time"|"pitch_tempo";source_bpm:number;target_bpm:number;preserve_pitch:boolean;pitch_semitones:number;preserve_formants:boolean;transients:"crisp"|"mixed"|"smooth"},csrf:string|null)=>apiRequest<{job_id:string;state:string}>(`/assets/${encodeURIComponent(asset)}/tempo-versions`,{method:"POST",body,csrf}),
};
export async function uploadAudio(project:string,song:string|null,file:File,csrf:string|null):Promise<AudioAsset> {
 if(file.size>100*1024*1024)throw new Error("Choose an audio file smaller than 100 MiB.");
 const body=new FormData();body.append("file",file);if(song)body.append("song_id",song);
 const response=await fetch(`/api/v1/projects/${encodeURIComponent(project)}/assets/upload`,{method:"POST",credentials:"same-origin",headers:csrf?{"x-csrf-token":csrf}:{},body});
 if(!response.ok){const data=await response.json().catch(()=>null) as {error?:{message?:string;code?:string}}|null;throw new ApiError(data?.error?.message??"Audio upload failed. Please try again.",response.status,data?.error?.code??"upload_failed");}
 return response.json() as Promise<AudioAsset>;
}
export function splitTags(value:FormDataEntryValue|null):string[]{return String(value??"").split(",").map(tag=>tag.trim()).filter(Boolean);}
