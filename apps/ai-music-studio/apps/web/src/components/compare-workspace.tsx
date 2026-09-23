"use client";

import Link from "next/link";
import { AudioLines, Check, Heart, Pause, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GenerationVersion, MusicGeneration } from "@hungreegoat/studio-contracts";
import type WaveSurfer from "wavesurfer.js";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import { useSongContext } from "@/hooks/use-song-context";
import { domain } from "@/lib/domain-client";
import { EmptyPanel, PageHeading } from "@/components/page-primitives";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hungreegoat/studio-ui/components/card";
import { Label } from "@hungreegoat/studio-ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hungreegoat/studio-ui/components/select";
import { Skeleton } from "@hungreegoat/studio-ui/components/skeleton";
import { Textarea } from "@hungreegoat/studio-ui/components/textarea";

type Slot = "A" | "B";
const formatTime = (seconds: number) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "0:00";

function ReviewCard({slot, version, host, playing, position, duration, ready, error, busy, onPlay, onSave}: {
  slot: Slot; version: GenerationVersion | undefined; host: React.RefObject<HTMLDivElement | null>;
  playing: boolean; position: number; duration: number; ready: boolean; error: string | null; busy: boolean;
  onPlay: () => void;
  onSave: (version: GenerationVersion, update: Partial<Pick<GenerationVersion, "favorite" | "approved" | "rejected" | "notes">>) => Promise<void>;
}) {
  const [notes, setNotes] = useState(version?.notes ?? "");
  return <Card aria-label={`Compare slot ${slot}`}><CardHeader>
    <CardTitle>{slot}: {version ? `Version ${String.fromCharCode(64 + version.version)}` : "Choose a version"}</CardTitle>
    <CardDescription>{version ? `${version.approved ? "Approved" : version.rejected ? "Rejected" : "In review"} · ${version.favorite ? "Favorite" : "Not favorited"}` : "Select a generated version above."}</CardDescription>
  </CardHeader><CardContent className="space-y-4">
    <div ref={host} aria-label={`Waveform ${slot}`} className="min-h-20 rounded-md bg-muted/40" />
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{error ?? (version && !ready ? "Loading waveform…" : "Select a position on the waveform to seek")}</span><span>{formatTime(position)} / {formatTime(duration)}</span></div>
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!version?.asset_id || !ready} onClick={onPlay} aria-label={`${playing ? "Pause" : "Play"} ${slot}`}>{playing ? <Pause /> : <Play />}{playing ? "Pause" : "Play"}</Button>
      {version && <><Button size="sm" variant="outline" disabled={busy} onClick={() => void onSave(version, { favorite: !version.favorite })} aria-pressed={version.favorite}><Heart />Favorite</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void onSave(version, { approved: !version.approved })} aria-pressed={version.approved}><Check />{version.approved ? "Unapprove" : "Approve"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void onSave(version, { rejected: !version.rejected })} aria-pressed={version.rejected}><X />{version.rejected ? "Undo rejection" : "Reject"}</Button></>}
    </div>
    {version && <div className="space-y-2"><Label htmlFor={`review-notes-${slot}`}>Listening notes</Label><Textarea id={`review-notes-${slot}`} value={notes} onChange={event => setNotes(event.target.value)} maxLength={8000} rows={4} placeholder="What works, and what would you change?" /><Button size="sm" variant="outline" disabled={busy || notes === version.notes} onClick={() => void onSave(version, { notes })}>Save notes</Button>{version.provider_request_id && <p className="break-all text-xs text-muted-foreground">Provider request: {version.provider_request_id}</p>}</div>}
  </CardContent></Card>;
}

export function CompareWorkspace() {
  const { song } = useSongContext();
  const { session } = useSession();
  const generations = useResource(`compare-generations:${song?.id ?? "none"}`, () => song ? domain.generations(song.id) : Promise.resolve({ items: [] as MusicGeneration[] }));
  const [generationId, setGenerationId] = useState<string | null>(null);
  const generation = generations.data?.items.find(item => item.id === generationId) ?? generations.data?.items[0];
  const versions = useResource(`compare-versions:${generation?.id ?? "none"}`, () => generation ? domain.generationVersions(generation.id) : Promise.resolve({ items: [] as GenerationVersion[] }));
  const available = versions.data?.items.filter(item => item.asset_id) ?? [];
  const [selection, setSelection] = useState<{ A: string | null; B: string | null }>({ A: null, B: null });
  const a = available.find(item => item.id === selection.A) ?? available[0];
  const b = available.find(item => item.id === selection.B) ?? available.find(item => item.id !== a?.id);
  const hostA = useRef<HTMLDivElement>(null);
  const hostB = useRef<HTMLDivElement>(null);
  const players = useRef<{ A: WaveSurfer | null; B: WaveSurfer | null }>({ A: null, B: null });
  const [active, setActive] = useState<Slot | null>(null);
  const [ready, setReady] = useState({ A: false, B: false });
  const [position, setPosition] = useState({ A: 0, B: 0 });
  const [duration, setDuration] = useState({ A: 0, B: 0 });
  const [waveError, setWaveError] = useState<{ A: string | null; B: string | null }>({ A: null, B: null });
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const instances: WaveSurfer[] = [];
    for (const slot of ["A", "B"] as const) {
      const asset = slot === "A" ? a?.asset_id : b?.asset_id;
      const container = slot === "A" ? hostA.current : hostB.current;
      if (!asset || !container) continue;
      void import("wavesurfer.js").then(({ default: WaveSurferClass }) => {
        if (!mounted) return;
        const player = WaveSurferClass.create({ container, url: `/api/v1/assets/${asset}/stream`, height: 80, waveColor: "#94a3b8", progressColor: "#0f766e", cursorColor: "#0f172a", fetchParams: { credentials: "same-origin" } });
        instances.push(player); players.current[slot] = player;
        player.on("ready", value => { setReady(previous => ({ ...previous, [slot]: true })); setDuration(previous => ({ ...previous, [slot]: value })); });
        player.on("timeupdate", value => setPosition(previous => ({ ...previous, [slot]: value })));
        player.on("error", () => setWaveError(previous => ({ ...previous, [slot]: "Audio could not be loaded." })));
        player.on("finish", () => setActive(current => current === slot ? null : current));
      });
    }
    return () => { mounted = false; instances.forEach(player => player.destroy()); players.current = { A: null, B: null }; };
  }, [a?.asset_id, b?.asset_id]);

  async function play(slot: Slot) {
    const chosen = players.current[slot];
    const other = players.current[slot === "A" ? "B" : "A"];
    if (!chosen) return;
    if (active === slot) { chosen.pause(); setActive(null); return; }
    other?.pause();
    if (other && Number.isFinite(other.getCurrentTime())) chosen.setTime(Math.min(other.getCurrentTime(), Math.max(0, chosen.getDuration() - 0.05)));
    try { await chosen.play(); setActive(slot); } catch { setWaveError(previous => ({ ...previous, [slot]: "Playback was blocked. Try again." })); }
  }

  async function save(version: GenerationVersion, update: Partial<Pick<GenerationVersion, "favorite" | "approved" | "rejected" | "notes">>) {
    setBusy(true); setReviewError(null);
    try { await domain.reviewVersion(version.id, update, session?.csrf_token ?? null); await versions.reload(); }
    catch (error) { setReviewError(error instanceof Error ? error.message : "Review could not be saved."); }
    finally { setBusy(false); }
  }

  function selectVersion(slot: Slot, value: string | null) {
    players.current.A?.pause(); players.current.B?.pause(); setActive(null);
    setReady({ A: false, B: false }); setPosition({ A: 0, B: 0 }); setDuration({ A: 0, B: 0 });
    setWaveError({ A: null, B: null });
    setSelection(previous => ({ ...previous, [slot]: value }));
  }

  if (!song) return <><PageHeading title="Listen & Compare" description="Review generated versions." /><EmptyPanel icon={AudioLines} title="Choose a song" description="Generated versions will appear here." href="/songs/new" action="Create a song" /></>;
  return <><PageHeading eyebrow="CREATE • REVIEW" title="Listen & Compare" description={`Compare listening versions for “${song.title}”.`} />
    {(generations.error || versions.error) && <p role="alert" className="text-sm text-destructive">{generations.error ?? versions.error}</p>}
    {generations.loading || versions.loading ? <Skeleton className="h-60 w-full" /> : available.length ? <>
      <div className="mb-5 flex flex-wrap gap-4">
        <div className="min-w-40 space-y-2"><Label htmlFor="compare-generation">Generation</Label><Select value={generation?.id ?? null} items={Object.fromEntries((generations.data?.items ?? []).map((item, index) => [item.id, `Run ${index + 1} · ${item.model}`]))} onValueChange={value => { setGenerationId(value); selectVersion("A", null); selectVersion("B", null); }}><SelectTrigger id="compare-generation"><SelectValue /></SelectTrigger><SelectContent>{generations.data?.items.map((item, index) => <SelectItem key={item.id} value={item.id}>Run {index + 1} · {item.model}</SelectItem>)}</SelectContent></Select></div>
        {(["A", "B"] as const).map(slot => <div key={slot} className="min-w-40 space-y-2"><Label htmlFor={`compare-${slot}`}>Slot {slot}</Label><Select value={(slot === "A" ? a : b)?.id ?? null} items={Object.fromEntries(available.map(item => [item.id, `Version ${String.fromCharCode(64 + item.version)}`]))} onValueChange={value => selectVersion(slot, value)}><SelectTrigger id={`compare-${slot}`}><SelectValue placeholder="Choose a version" /></SelectTrigger><SelectContent>{available.map(item => <SelectItem key={item.id} value={item.id}>Version {String.fromCharCode(64 + item.version)}</SelectItem>)}</SelectContent></Select></div>)}
      </div>
      <p className="mb-5 text-sm text-muted-foreground">Switching playback keeps the current time. Drag either waveform to seek.</p>
      {reviewError && <p role="alert" className="mb-5 text-sm text-destructive">{reviewError}</p>}
      <div className="grid gap-5 lg:grid-cols-2">{(["A", "B"] as const).map(slot => <ReviewCard key={`${slot}:${(slot === "A" ? a : b)?.id ?? "none"}`} slot={slot} version={slot === "A" ? a : b} host={slot === "A" ? hostA : hostB} playing={active === slot} position={position[slot]} duration={duration[slot]} ready={ready[slot]} error={waveError[slot]} busy={busy} onPlay={() => void play(slot)} onSave={save} />)}</div>
      <Button variant="outline" className="mt-5" render={<Link href={`/generation?song_id=${song.id}`} />} nativeButton={false}><RotateCcw />Generate more versions</Button>
    </> : <EmptyPanel icon={AudioLines} title="No generated versions" description="Generate music first, then compare immutable versions here." href={`/generation?song_id=${song.id}`} action="Open Generation" />}
  </>;
}
