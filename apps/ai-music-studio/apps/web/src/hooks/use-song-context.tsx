"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { StudioSong } from "@hungreegoat/studio-contracts";
import { domain } from "@/lib/domain-client";
import { useSession } from "@/hooks/use-session";
interface Context {
  song: StudioSong | null;
  error: string | null;
  select: (song: StudioSong) => void;
  clear: () => void;
  toolHref: (href: string) => string;
}
interface Selection { workspace: string; song: StudioSong | null; error: string | null }
const SongContext = createContext<Context | null>(null);
export function SongProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("song_id");
  const workspace = session?.active_workspace_id ?? "none";
  const key = `studio:selected-song:${workspace}`;
  const requestEpoch = useRef(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const song = selection?.workspace === workspace ? selection.song : null;
  const error = selection?.workspace === workspace ? selection.error : null;
  const select = useCallback((value: StudioSong) => {
    requestEpoch.current += 1;
    setSelection({ workspace, song: value, error: null });
    localStorage.setItem(key, value.id);
  }, [key, workspace]);
  const clear = useCallback(() => {
    requestEpoch.current += 1;
    setSelection({ workspace, song: null, error: null });
    localStorage.removeItem(key);
  }, [key, workspace]);
  useEffect(() => {
    const epoch = ++requestEpoch.current;
    const id = requestedId ?? localStorage.getItem(key);
    let active = true;
    const request = id ? domain.song(id) : Promise.resolve(null);
    void request.then(value => {
      if (!active || epoch !== requestEpoch.current) return;
      setSelection({ workspace, song: value, error: null });
      if (value) localStorage.setItem(key, value.id);
    }).catch(() => {
      if (!active || epoch !== requestEpoch.current) return;
      setSelection({ workspace, song: null, error: "The selected song is unavailable. Choose another song from Projects." });
      localStorage.removeItem(key);
    });
    return () => { active = false; };
  }, [key, workspace, requestedId]);
  return <SongContext.Provider value={{ song, error, select, clear, toolHref: href => song ? `${href}?song_id=${encodeURIComponent(song.id)}` : href }}>{children}</SongContext.Provider>;
}
export function useSongContext() {
  const value = useContext(SongContext);
  if (!value) throw new Error("SongProvider is required");
  return value;
}
