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
 stemSets:(asset:string)=>apiRequest<{items:StemSet[]}>(`/assets/${encodeURIComponent(asset)}/stem-sets`),
 requestStemSet:(asset:string,key:string,csrf:string|null)=>apiRequest<{stem_set_id:string;job_id:string;state:string}>(`/assets/${encodeURIComponent(asset)}/stem-sets`,{method:"POST",body:{idempotency_key:key},csrf}),
 mixVersions:(stemSet:string)=>apiRequest<{items:MixVersion[]}>(`/stem-sets/${encodeURIComponent(stemSet)}/mix-versions`),
  requestMix:(stemSet:string,body:{idempotency_key:string;levels:StemLevels},csrf:string|null)=>apiRequest<{job_id:string;state:string}>(`/stem-sets/${encodeURIComponent(stemSet)}/mix-versions`,{method:"POST",body,csrf}),
  masters:(asset:string)=>apiRequest<{items:MasterVersion[]}>(`/assets/${encodeURIComponent(asset)}/masters`),
  requestMaster:(asset:string,body:{idempotency_key:string;reference_asset_id?:string;target_lufs:number;true_peak_dbtp:number},csrf:string|null)=>apiRequest<{job_id:string;state:string}>(`/assets/${encodeURIComponent(asset)}/masters`,{method:"POST",body,csrf}),
  exports:(asset:string)=>apiRequest<{items:ExportVersion[]}>(`/assets/${encodeURIComponent(asset)}/exports`),
  requestExport:(asset:string,body:{idempotency_key:string;format:"wav"|"mp3";bit_depth?:16|24;mp3_bitrate_kbps?:128|192|256|320},csrf:string|null)=>apiRequest<{job_id:string;state:string}>(`/assets/${encodeURIComponent(asset)}/exports`,{method:"POST",body,csrf}),
  stemSetExports:(stemSet:string)=>apiRequest<{items:StemSetExport[]}>(`/stem-sets/${encodeURIComponent(stemSet)}/exports`),
  requestStemSetExport:(stemSet:string,key:string,csrf:string|null)=>apiRequest<{job_id:string;state:string}>(`/stem-sets/${encodeURIComponent(stemSet)}/exports`,{method:"POST",body:{idempotency_key:key},csrf}),
};
export type StemLabel = "vocals" | "drums" | "bass" | "other";
export type StemLevels = Record<StemLabel, number>;
export interface StemSet { id:string; source_asset_id:string; engine:string; engine_version:string; stems:{id:string;label:StemLabel;asset_id:string}[]; created_at:string }
export interface MixVersion { id:string; asset_id:string; version:number; levels:StemLevels; created_at:string }
export interface MasterVersion { id:string; source_asset_id:string; reference_asset_id:string|null; asset_id:string; engine:string; settings:{target_lufs?:number;true_peak_dbtp?:number}; created_at:string }
export interface ExportVersion { id:string; source_asset_id:string; asset_id:string; format:"wav"|"mp3"; settings:{bit_depth?:number;mp3_bitrate_kbps?:number}; created_at:string }
export interface StemSetExport { id:string; stem_set_id:string; byte_size:number; sha256:string; manifest:Record<StemLabel,{asset_id:string;sha256:string}>; created_at:string }
export async function uploadAudio(project:string,song:string|null,file:File,csrf:string|null):Promise<AudioAsset> {
 if(file.size>100*1024*1024)throw new Error("Choose an audio file smaller than 100 MiB.");
 const body=new FormData();body.append("file",file);if(song)body.append("song_id",song);
 const response=await fetch(`/api/v1/projects/${encodeURIComponent(project)}/assets/upload`,{method:"POST",credentials:"same-origin",headers:csrf?{"x-csrf-token":csrf}:{},body});
 if(!response.ok){const data=await response.json().catch(()=>null) as {error?:{message?:string;code?:string}}|null;throw new ApiError(data?.error?.message??"Audio upload failed. Please try again.",response.status,data?.error?.code??"upload_failed");}
 return response.json() as Promise<AudioAsset>;
}
export function splitTags(value:FormDataEntryValue|null):string[]{return String(value??"").split(",").map(tag=>tag.trim()).filter(Boolean);}
