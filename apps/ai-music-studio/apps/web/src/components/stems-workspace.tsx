"use client";

import { Download, Layers3, Pause, Play, RefreshCw, Save, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioAsset } from "@hungreegoat/studio-contracts";
import { JobActivity } from "@/components/job-activity";
import { EmptyPanel, PageHeading } from "@/components/page-primitives";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import { useSongContext } from "@/hooks/use-song-context";
import { domain, type StemLabel, type StemLevels } from "@/lib/domain-client";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@hungreegoat/studio-ui/components/badge";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hungreegoat/studio-ui/components/card";
import { Label } from "@hungreegoat/studio-ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hungreegoat/studio-ui/components/select";
import { Skeleton } from "@hungreegoat/studio-ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@hungreegoat/studio-ui/components/tabs";

const labels: StemLabel[] = ["vocals", "drums", "bass", "other"];
const displayName: Record<StemLabel, string> = { vocals: "Vocals", drums: "Drums", bass: "Bass", other: "Other" };
const defaultLevels: StemLevels = { vocals: 1, drums: 1, bass: 1, other: 1 };

export function StemsWorkspace() {
  const { song } = useSongContext();
  const { session } = useSession();
  const assets = useResource(`stems-assets:${song?.id ?? "none"}`, () => song ? domain.assets(undefined, song.id) : Promise.resolve({ items: [] as AudioAsset[] }));
  const [assetId, setAssetId] = useState<string | null>(null);
  const asset = assets.data?.items.find(item => item.id === assetId) ?? assets.data?.items[0];
  const stemSets = useResource(`stem-sets:${asset?.id ?? "none"}`, () => asset ? domain.stemSets(asset.id) : Promise.resolve({ items: [] }));
  const [stemSetId, setStemSetId] = useState<string | null>(null);
  const stemSet = stemSets.data?.items.find(item => item.id === stemSetId) ?? stemSets.data?.items.find(item => item.stems.length === 4) ?? stemSets.data?.items[0];
  const mixes = useResource(`mix-versions:${stemSet?.id ?? "none"}`, () => stemSet ? domain.mixVersions(stemSet.id) : Promise.resolve({ items: [] }));
  const [separating, setSeparating] = useState(false);
  const [mixing, setMixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [levels, setLevels] = useState<StemLevels>(defaultLevels);
  const [muted, setMuted] = useState<Record<StemLabel, boolean>>({ vocals: false, drums: false, bass: false, other: false });
  const [solo, setSolo] = useState<Record<StemLabel, boolean>>({ vocals: false, drums: false, bass: false, other: false });
  const [playing, setPlaying] = useState(false);
  const players = useRef<Partial<Record<StemLabel, HTMLAudioElement>>>({});
  const pendingStemSetId = useRef<string | null>(null);
  const pendingStemJobId = useRef<string | null>(null);
  const pendingMixJobId = useRef<string | null>(null);
  const mixCount = useRef<number | null>(null);

  const stemMap = useMemo(() => Object.fromEntries((stemSet?.stems ?? []).map(stem => [stem.label, stem])) as Partial<Record<StemLabel, { id:string; label:StemLabel; asset_id:string }>>, [stemSet]);
  const hasSolo = labels.some(label => solo[label]);
  useEffect(() => {
    labels.forEach(label => { const player = players.current[label]; if (player) { player.volume = levels[label]; player.muted = muted[label] || (hasSolo && !solo[label]); } });
  }, [levels, muted, solo, hasSolo, stemSet?.id]);
  useEffect(() => {
    if (!separating || pendingStemSetId.current === null) return;
    const ready = stemSets.data?.items.find(item => item.id === pendingStemSetId.current && item.stems.length === 4);
    if (ready) { setSeparating(false); setStemSetId(ready.id); setMessage("Stem separation finished. Your new four-track set is ready to mix."); return; }
    const timer = window.setInterval(() => { void stemSets.reload(); if (pendingStemJobId.current) void apiRequest<{state:string;error_code:string|null}>(`/jobs/${pendingStemJobId.current}`).then(job => { if (job.state === "failed" || job.state === "cancelled") { setSeparating(false); setError(`Stem separation ${job.state}${job.error_code ? ` (${job.error_code})` : ""}.`); } }).catch(() => undefined); }, 5000); return () => window.clearInterval(timer);
  }, [separating, stemSets, stemSets.data?.items.length]);
  useEffect(() => {
    if (!mixing || mixCount.current === null || (mixes.data?.items.length ?? 0) > mixCount.current) {
      if (mixCount.current !== null && (mixes.data?.items.length ?? 0) > mixCount.current) { setMixing(false); setMessage("Mix render finished. Your immutable result is in mix history."); }
      return;
    }
    const timer = window.setInterval(() => { void mixes.reload(); if (pendingMixJobId.current) void apiRequest<{state:string;error_code:string|null}>(`/jobs/${pendingMixJobId.current}`).then(job => { if (job.state === "failed" || job.state === "cancelled") { setMixing(false); setError(`Mix rendering ${job.state}${job.error_code ? ` (${job.error_code})` : ""}.`); } }).catch(() => undefined); }, 5000); return () => window.clearInterval(timer);
  }, [mixing, mixes, mixes.data?.items.length]);
  useEffect(() => () => { labels.forEach(label => players.current[label]?.pause()); }, []);

  async function separate() {
    if (!asset) return;
    setSeparating(true); setError(null); setMessage(null);
    try { const queued = await domain.requestStemSet(asset.id, crypto.randomUUID(), session?.csrf_token ?? null); pendingStemSetId.current = queued.stem_set_id; pendingStemJobId.current = queued.job_id; setMessage("Stem separation queued. Demucs will create independent vocals, drums, bass, and other assets."); void stemSets.reload(); }
    catch (cause) { setSeparating(false); setError(cause instanceof Error ? cause.message : "Stem separation could not start."); }
  }
  async function togglePlayback() {
    const available = labels.map(label => players.current[label]).filter((player): player is HTMLAudioElement => !!player);
    if (!available.length) return;
    if (playing) { available.forEach(player => player.pause()); setPlaying(false); return; }
    try { await Promise.all(available.map(player => player.play())); setPlaying(true); }
    catch { available.forEach(player => player.pause()); setPlaying(false); setError("Browser playback could not start all stems. Try again after interacting with the page."); }
  }
  function sync(label: StemLabel) { const source = players.current[label]; if (!source) return; labels.filter(other => other !== label).forEach(other => { const player = players.current[other]; if (player && Math.abs(player.currentTime - source.currentTime) > .08) player.currentTime = source.currentTime; }); }
  function resetMixer() { setLevels(defaultLevels); setMuted({ vocals: false, drums: false, bass: false, other: false }); setSolo({ vocals: false, drums: false, bass: false, other: false }); }
  async function saveMix() {
    if (!stemSet) return;
    setMixing(true); setError(null); setMessage(null); mixCount.current = mixes.data?.items.length ?? 0;
    try { const queued = await domain.requestMix(stemSet.id, { idempotency_key: crypto.randomUUID(), levels }, session?.csrf_token ?? null); pendingMixJobId.current = queued.job_id; setMessage("Mix render queued. Your source stems remain unchanged."); }
    catch (cause) { setMixing(false); setError(cause instanceof Error ? cause.message : "Mix render could not start."); }
  }
  function changeSource(value: string | null) { labels.forEach(label => players.current[label]?.pause()); setPlaying(false); setAssetId(value); setStemSetId(null); setError(null); setMessage(null); pendingStemSetId.current = null; pendingStemJobId.current = null; pendingMixJobId.current = null; setSeparating(false); setMixing(false); }

  if (!song) return <><PageHeading title="Stems & Mixing" description="Separate an audio version into stems and build non-destructive mixes." /><EmptyPanel icon={Layers3} title="Choose a song" description="Start with a song and an audio version to separate." href="/songs/new" action="Create a song" /></>;
  return <><PageHeading eyebrow="CREATE • FINISH" title="Stems & Mixing" description={`Separate and rebalance “${song.title}” without changing its source.`} />
    {(assets.error || stemSets.error || mixes.error) && <p role="alert" className="mb-4 text-sm text-destructive">{assets.error ?? stemSets.error ?? mixes.error}</p>}
    {assets.loading || stemSets.loading || mixes.loading ? <Skeleton className="h-72 w-full" /> : !assets.data?.items.length ? <EmptyPanel icon={Layers3} title="Add audio first" description="Upload or generate an audio version before separating stems." href={`/songs/${song.id}`} action="Open song" /> : <div className="space-y-6">
      <div className="max-w-xl space-y-2"><Label htmlFor="stems-source">Source audio</Label><Select value={asset?.id ?? null} items={Object.fromEntries(assets.data.items.map(item => [item.id, `${item.kind} · ${item.original_filename}`]))} onValueChange={changeSource}><SelectTrigger id="stems-source"><SelectValue /></SelectTrigger><SelectContent>{assets.data.items.map(item => <SelectItem key={item.id} value={item.id}>{item.kind} · {item.original_filename}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Separation creates a new, lineage-tracked stem set; it never replaces this asset.</p></div>
      <Card><CardHeader><CardTitle>Stem separation</CardTitle><CardDescription>Demucs extracts four independent, downloadable tracks. CPU separation supports sources up to three minutes.</CardDescription></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Button disabled={separating || (asset?.duration_seconds ?? 0) > 180} onClick={() => void separate()}><Layers3 />{separating ? "Separating…" : "Separate into stems"}</Button><Button variant="outline" onClick={() => void stemSets.reload()}><RefreshCw />Refresh stem sets</Button>{stemSet && <Badge variant="outline">{stemSet.engine} · {stemSet.engine_version}</Badge>}</CardContent></Card>
      {stemSet ? <Tabs defaultValue="mixer"><TabsList><TabsTrigger value="mixer">Stem mixer</TabsTrigger><TabsTrigger value="history">Stem sets & mixes</TabsTrigger></TabsList><TabsContent value="mixer" className="mt-5 space-y-5"><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Four-track mixer</CardTitle><CardDescription>All stems start and seek together. Mute and solo affect monitoring only until you save a mix.</CardDescription></div><div className="flex gap-2"><Button variant="outline" onClick={() => void togglePlayback()}>{playing ? <Pause /> : <Play />}{playing ? "Pause" : "Play stems"}</Button><Button variant="outline" onClick={resetMixer}>Reset</Button></div></div></CardHeader><CardContent className="space-y-3">{labels.map(label => { const stem = stemMap[label]; return <div key={label} className="rounded-lg border p-4"><div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"><div><p className="font-medium">{displayName[label]}</p><p className="text-xs text-muted-foreground">{Math.round(levels[label] * 100)}%</p></div><input aria-label={`${displayName[label]} volume`} type="range" min="0" max="1" step="0.01" value={levels[label]} onChange={event => setLevels(previous => ({ ...previous, [label]: Number(event.target.value) }))} /><div className="flex gap-2"><Button size="sm" variant={muted[label] ? "default" : "outline"} aria-pressed={muted[label]} onClick={() => setMuted(previous => ({ ...previous, [label]: !previous[label] }))}>{muted[label] ? <VolumeX /> : <Volume2 />}Mute</Button><Button size="sm" variant={solo[label] ? "default" : "outline"} aria-pressed={solo[label]} onClick={() => setSolo(previous => ({ ...previous, [label]: !previous[label] }))}>Solo</Button></div></div>{stem ? <><audio ref={node => { players.current[label] = node ?? undefined; }} src={`/api/v1/assets/${stem.asset_id}/stream`} preload="metadata" onTimeUpdate={() => sync(label)} onEnded={() => { if (label === labels[0]) setPlaying(false); }} className="sr-only" aria-label={`${displayName[label]} stem`} /><a className="mt-3 inline-flex items-center gap-1 text-sm underline" href={`/api/v1/assets/${stem.asset_id}/download`} download><Download className="size-4" />Download {displayName[label]}</a></> : <p className="mt-3 text-sm text-muted-foreground">This stem is unavailable in the selected set.</p>}</div>; })}</CardContent></Card><Card><CardHeader><CardTitle>Recombine as a new mix</CardTitle><CardDescription>Saving renders a fresh immutable audio asset using these gain levels.</CardDescription></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Button disabled={mixing || labels.some(label => !stemMap[label])} onClick={() => void saveMix()}><Save />{mixing ? "Rendering…" : "Save mix version"}</Button><span className="text-sm text-muted-foreground">Vocals {Math.round(levels.vocals * 100)}% · Drums {Math.round(levels.drums * 100)}% · Bass {Math.round(levels.bass * 100)}% · Other {Math.round(levels.other * 100)}%</span></CardContent></Card></TabsContent><TabsContent value="history" className="mt-5 space-y-5"><Card><CardHeader><CardTitle>Stem sets</CardTitle><CardDescription>Each separation is retained with its source and engine lineage.</CardDescription></CardHeader><CardContent className="space-y-2">{stemSets.data?.items.map(item => <Button key={item.id} variant={item.id === stemSet.id ? "default" : "outline"} className="flex h-auto w-full justify-between py-3 text-left" onClick={() => setStemSetId(item.id)}><span>{item.engine} · {item.stems.length}/4 stems</span><span className="text-xs opacity-70">{new Date(item.created_at).toLocaleString()}</span></Button>)}</CardContent></Card><Card><CardHeader><CardTitle>Mix version history</CardTitle><CardDescription>Rendered mixes are separate assets you can download or audition.</CardDescription></CardHeader><CardContent className="space-y-3">{mixes.data?.items.length ? mixes.data.items.map(mix => <div key={mix.id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>Mix {mix.version} · V {Math.round(mix.levels.vocals * 100)}% · D {Math.round(mix.levels.drums * 100)}% · B {Math.round(mix.levels.bass * 100)}% · O {Math.round(mix.levels.other * 100)}%</span><a className="underline" href={`/api/v1/assets/${mix.asset_id}/download`} download>Download</a></div><audio controls preload="none" className="mt-2 w-full" src={`/api/v1/assets/${mix.asset_id}/stream`} aria-label={`Mix version ${mix.version}`} /></div>) : <p className="text-sm text-muted-foreground">No saved mixes yet.</p>}<Button variant="outline" onClick={() => void mixes.reload()}><RefreshCw />Refresh mix history</Button></CardContent></Card></TabsContent></Tabs> : <EmptyPanel icon={Layers3} title="No stem sets yet" description="Request a Demucs separation above. When the job finishes, its four stems will appear here." href={`/songs/${song.id}`} action="View source audio" />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <JobActivity song={song.id} />
    </div>}
  </>;
}
