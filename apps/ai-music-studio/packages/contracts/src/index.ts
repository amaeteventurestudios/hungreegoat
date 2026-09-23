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
