import type { StudioJob,JobEvent } from "@hungreegoat/studio-contracts";
import { apiRequest } from "@/lib/api-client";
export const jobs = {
 list:(filters:{project?:string;song?:string;state?:string}={},signal?:AbortSignal)=>apiRequest<{items:StudioJob[]}>(`/jobs?${new URLSearchParams({limit:"50",...(filters.project?{project_id:filters.project}:{}),...(filters.song?{song_id:filters.song}:{}),...(filters.state?{state:filters.state}:{})})}`,{signal}),
 get:(id:string,signal?:AbortSignal)=>apiRequest<StudioJob>(`/jobs/${encodeURIComponent(id)}`,{signal}),
 events:(id:string)=>apiRequest<{items:JobEvent[]}>(`/jobs/${encodeURIComponent(id)}/events?limit=100`),
 command:(id:string,command:"cancel"|"retry",csrf:string|null)=>apiRequest<{job_id:string;state:string}>(`/jobs/${encodeURIComponent(id)}/${command}`,{method:"POST",csrf}),
};
export const activeJob = (job:StudioJob)=>["pending","queued","running"].includes(job.state);
export const jobLabels:Record<string,string>={"system.verify":"Studio diagnostic","producer.plan":"Production plan","music.generate":"Music generation","music.regenerate_section":"Section regeneration","audio.analyze":"Audio analysis","audio.waveform":"Waveform analysis","audio.transcode":"Audio conversion","audio.tempo":"Tempo transformation","audio.tempo_transform":"Tempo transformation","audio.pitch_transform":"Pitch transformation","audio.separate_stems":"Stem separation","audio.master":"Mastering","audio.export":"Audio export"};
