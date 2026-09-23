export interface HealthResponse { status: string; service?: string; checks?: Record<string, string>; }

export interface StudioSession {
  authenticated: boolean;
  user: { id: string; email: string; display_name: string } | null;
  workspaces: { id: string; name: string; role: string }[];
  active_workspace_id: string | null;
  csrf_token: string | null;
}
export interface StudioSettings {
  workspace: { name: string };
  appearance: { theme: "light" | "dark" | "system" };
  audio: { sample_rate: 44100 | 48000; bpm: number };
  exports: { format: "wav" | "mp3"; bit_depth: 16 | 24; mp3_bitrate_kbps: 128 | 192 | 256 | 320 };
  providers: { default_producer: string | null; default_music: string | null };
}
export interface SystemHealth {
  storage: { available: boolean; total_bytes: number | null; free_bytes: number | null };
  engines: { id: string; name: string; available: boolean; status: "available" | "not_installed" }[];
}
export interface ProviderConfig {
  provider: string;
  category: string;
  enabled: boolean;
  credential_present: boolean;
  masked_secret: string | null;
  connection_status: "not_configured" | "unverified" | "connected" | "error";
  default_model: string | null;
  capabilities: string[];
  health_status: "unknown" | "healthy" | "degraded" | "unavailable";
  last_health_check_at: string | null;
  last_successful_health_check_at: string | null;
  updated_at: string | null;
  usage: { available: boolean; [key: string]: unknown };
}
export interface ProviderModels { items: { id: string; label: string }[]; source: string }

export interface ProviderHealthResult { ok:boolean; provider:string; health_status:ProviderConfig["health_status"]; checked_at:string; error_code:string|null; message:string }
export interface StudioProject { id:string; name:string; description:string; tags:string[]; created_at:string; updated_at:string }
export interface StudioSong { id:string; project_id:string; title:string; brief:string; style:string; vocal_mode:"instrumental"|"vocals"|"auto"; target_duration_seconds:number|null; notes:string; tags:string[]; bpm:number|null; musical_key:string|null; created_at:string; updated_at:string }
export interface AudioAsset { id:string; project_id:string; song_id:string|null; kind:string; original_filename:string; media_type:string; byte_size:number; sha256:string; duration_seconds:number|null; sample_rate:number|null; channels:number|null; created_at:string }
export interface AssetLineage { id:string; parent_asset_id:string; child_asset_id:string; operation:string; parameters:Record<string,unknown>; created_at:string }
export type JobState = "pending" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
export interface StudioJob {
 id:string; project_id:string; song_id:string|null; kind:string; state:JobState;
 progress_percent:number; current_stage:string|null; error_code:string|null; error_message:string|null;
 result_asset_id:string|null; created_at:string; updated_at:string; started_at:string|null; completed_at:string|null;
 attempt:number; can_retry:boolean; can_cancel:boolean; cancel_requested:boolean; outcome_unknown:boolean;
}
export interface JobEvent { id:string; sequence:number; state:JobState; message:string; created_at:string }
export interface ProductionPlan { id:string; song_id:string; version:number; provider:string; model:string; plan:{style:string;bpm:number|null;musical_key:string|null;instrumentation:string[];structure:string[];energy_curve:string[];vocal_direction:string;arrangement_guidance:string;negative_instructions:string[];production_notes:string;provider_request_id:string|null}; active:boolean; created_at:string }
export interface MusicGeneration { id:string; song_id:string; plan_id:string|null; provider:string; model:string; settings:{version_count:number;duration_seconds:number;force_instrumental:boolean;prompt:string;composition_plan?:Record<string,unknown>|null}; created_at:string }
export interface GenerationVersion { id:string; generation_id:string; version:number; asset_id:string|null; approved:boolean; rejected:boolean; favorite:boolean; notes:string; provider_request_id:string|null; metadata:Record<string,unknown>; created_at:string }
