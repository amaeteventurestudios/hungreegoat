"use client";

import { AudioLines, Pause, Play, RefreshCw, ScanSearch, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AudioAsset } from "@hungreegoat/studio-contracts";
import { JobActivity } from "@/components/job-activity";
import { EmptyPanel, PageHeading } from "@/components/page-primitives";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import { useSongContext } from "@/hooks/use-song-context";
import { domain } from "@/lib/domain-client";
import { Badge } from "@hungreegoat/studio-ui/components/badge";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hungreegoat/studio-ui/components/card";
import { Input } from "@hungreegoat/studio-ui/components/input";
import { Label } from "@hungreegoat/studio-ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hungreegoat/studio-ui/components/select";
import { Skeleton } from "@hungreegoat/studio-ui/components/skeleton";

const bpmPresets = [90, 100, 120, 140, 160, 180, 200];
const modes = {
  time_stretch: "Time stretch", double_time: "Double-time", half_time: "Half-time", pitch_tempo: "Pitch + tempo",
} as const;
type Mode = keyof typeof modes;
type Transients = "crisp" | "mixed" | "smooth";

export function TempoWorkspace() {
  const { song } = useSongContext();
  const { session } = useSession();
  const assets = useResource(`tempo-assets:${song?.id ?? "none"}`, () => song ? domain.assets(undefined, song.id) : Promise.resolve({ items: [] as AudioAsset[] }));
  const [assetId, setAssetId] = useState<string | null>(null);
  const asset = assets.data?.items.find(item => item.id === assetId) ?? assets.data?.items[0];
  const analysisResource = useResource(`analysis:${asset?.id ?? "none"}`, () => asset ? domain.analysis(asset.id) : Promise.resolve({ items: [] }));
  const variants = useResource(`tempo-variants:${asset?.id ?? "none"}`, () => asset ? domain.tempoVersions(asset.id) : Promise.resolve({ items: [] }));
  const reloadAnalysis = analysisResource.reload;
  const reloadVariants = variants.reload;
  const analysis = analysisResource.data?.items[0];
  const [manualBpm, setManualBpm] = useState<number | null>(null);
  const sourceBpm = manualBpm ?? analysis?.detected_bpm ?? song?.bpm ?? 120;
  const [targetBpm, setTargetBpm] = useState(140);
  const [mode, setMode] = useState<Mode>("time_stretch");
  const [preservePitch, setPreservePitch] = useState(true);
  const [preserveFormants, setPreserveFormants] = useState(true);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [transients, setTransients] = useState<Transients>("mixed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [variantBaseline, setVariantBaseline] = useState<number | null>(null);
  const preview = useRef<HTMLAudioElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const ratio = sourceBpm > 0 ? targetBpm / sourceBpm : 0;
  const modeMatches = mode === "double_time" ? Math.abs(ratio - 2) < 0.001 : mode === "half_time" ? Math.abs(ratio - 0.5) < 0.001 : true;
  const validRatio = Number.isFinite(ratio) && ratio >= 0.5 && ratio <= 2 && (asset?.duration_seconds ?? Infinity) / ratio <= 600 && modeMatches;
  const extreme = ratio < 0.67 || ratio > 1.5;

  useEffect(() => {
    if (!analysisPending || analysis) return;
    const timer = window.setInterval(() => void reloadAnalysis(), 5000);
    return () => window.clearInterval(timer);
  }, [analysisPending, analysis, reloadAnalysis]);
  useEffect(() => {
    if (variantBaseline === null || (variants.data?.items.length ?? 0) > variantBaseline) return;
    const timer = window.setInterval(() => void reloadVariants(), 5000);
    return () => window.clearInterval(timer);
  }, [variantBaseline, variants.data?.items.length, reloadVariants]);

  async function analyze() {
    if (!asset) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await domain.requestAnalysis(asset.id, crypto.randomUUID(), session?.csrf_token ?? null);
      setAnalysisPending(true); setMessage("Analysis queued. Results will refresh when the worker finishes.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Analysis could not start."); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!asset) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await domain.requestTempo(asset.id, {
        idempotency_key: crypto.randomUUID(), mode, source_bpm: sourceBpm, target_bpm: targetBpm,
        preserve_pitch: preservePitch, pitch_semitones: pitchSemitones,
        preserve_formants: preserveFormants, transients,
      }, session?.csrf_token ?? null);
      setVariantBaseline(variants.data?.items.length ?? 0);
      setMessage("Tempo render queued. The original stays intact; the new version will appear below.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tempo render could not start."); }
    finally { setBusy(false); }
  }
  async function togglePreview() {
    const player = preview.current;
    if (!player) return;
    if (previewing) { player.pause(); setPreviewing(false); return; }
    player.playbackRate = Math.max(0.5, Math.min(2, ratio));
    player.preservesPitch = preservePitch;
    try { await player.play(); setPreviewing(true); }
    catch { setError("Browser preview could not play this audio."); }
  }
  function selectAsset(value: string | null) {
    preview.current?.pause(); setPreviewing(false); setAssetId(value);
    setManualBpm(null); setAnalysisPending(false); setVariantBaseline(null);
    setError(null); setMessage(null);
  }
  function selectMode(value: Mode) {
    setMode(value);
    if (value === "double_time") setTargetBpm(Math.min(300, sourceBpm * 2));
    if (value === "half_time") setTargetBpm(Math.max(30, sourceBpm / 2));
  }

  if (!song) return <><PageHeading title="Tempo / Remix" description="Analyze and reshape audio without changing the source." /><EmptyPanel icon={AudioLines} title="Choose a song" description="Start with a song and audio asset." href="/songs/new" action="Create a song" /></>;
  return <><PageHeading eyebrow="CREATE • TRANSFORM" title="Tempo / Remix" description={`Explore new pace and pitch for “${song.title}”.`} />
    {(assets.error || analysisResource.error || variants.error) && <p role="alert" className="mb-4 text-sm text-destructive">{assets.error ?? analysisResource.error ?? variants.error}</p>}
    {assets.loading || analysisResource.loading || variants.loading ? <Skeleton className="h-72 w-full" /> : !assets.data?.items.length ? <EmptyPanel icon={AudioLines} title="Add audio first" description="Upload or generate an audio version before analyzing tempo." href={`/songs/${song.id}`} action="Open song" /> : <div className="space-y-6">
      <div className="max-w-md space-y-2"><Label htmlFor="tempo-source">Source audio</Label><Select value={asset?.id ?? null} items={Object.fromEntries(assets.data.items.map(item => [item.id, `${item.kind} · ${item.original_filename}`]))} onValueChange={selectAsset}><SelectTrigger id="tempo-source"><SelectValue /></SelectTrigger><SelectContent>{assets.data.items.map(item => <SelectItem key={item.id} value={item.id}>{item.kind} · {item.original_filename}</SelectItem>)}</SelectContent></Select></div>
      {asset && <audio ref={preview} src={`/api/v1/assets/${asset.id}/stream`} preload="none" onEnded={() => setPreviewing(false)} className="sr-only" aria-label="Tempo source preview" />}
      <div className="grid items-start gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Audio analysis</CardTitle><CardDescription>Measurements belong to this immutable source asset.</CardDescription></CardHeader><CardContent className="space-y-4">{analysis ? <><div className="grid grid-cols-2 gap-3 text-sm"><div><span className="text-muted-foreground">Detected BPM</span><p>{analysis.detected_bpm?.toFixed(1) ?? "Not confident"}</p></div><div><span className="text-muted-foreground">Key estimate</span><p>{analysis.musical_key ?? "Not confident"}</p></div><div><span className="text-muted-foreground">Loudness</span><p>{analysis.measurements.loudness_lufs?.toFixed(1) ?? "Unavailable"} LUFS</p></div><div><span className="text-muted-foreground">Duration</span><p>{analysis.measurements.duration_seconds.toFixed(1)} s</p></div><div><span className="text-muted-foreground">Sample rate</span><p>{analysis.measurements.sample_rate.toLocaleString()} Hz</p></div><div><span className="text-muted-foreground">Channels</span><p>{analysis.measurements.channels}</p></div></div><div className="flex h-20 items-end gap-px overflow-hidden rounded-md bg-muted/30 p-2" aria-label="Measured audio peaks">{analysis.measurements.peaks.map((peak, index) => <span key={index} className="min-w-px flex-1 bg-primary/70" style={{ height: `${Math.max(2, peak * 100)}%` }} />)}</div><Badge variant="outline">{analysis.analyzer_version}</Badge></> : <p className="text-sm text-muted-foreground">No analysis yet. BPM and key are estimates; silence may have neither.</p>}<div className="flex flex-wrap gap-2"><Button disabled={busy || !!analysis || analysisPending} onClick={() => void analyze()}><ScanSearch />{analysisPending ? "Analyzing…" : "Analyze audio"}</Button><Button variant="outline" onClick={() => void analysisResource.reload()}><RefreshCw />Refresh</Button></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Tempo & pitch</CardTitle><CardDescription>Preview tempo in the browser; the worker renders the final pitch and formants.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="source-bpm">Source BPM</Label><Input id="source-bpm" type="number" min={30} max={300} value={sourceBpm} onChange={event => setManualBpm(Number(event.target.value))} /></div><div className="space-y-2"><Label htmlFor="target-bpm">Target BPM</Label><Input id="target-bpm" type="number" min={30} max={300} value={targetBpm} onChange={event => setTargetBpm(Number(event.target.value))} /></div></div><div className="flex flex-wrap gap-2" aria-label="Target BPM presets">{bpmPresets.map(value => <Button key={value} size="sm" variant={targetBpm === value ? "default" : "outline"} onClick={() => setTargetBpm(value)}>{value}</Button>)}</div><div className="space-y-2"><Label htmlFor="tempo-mode">Mode</Label><Select value={mode} items={modes} onValueChange={value => selectMode(value as Mode)}><SelectTrigger id="tempo-mode"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(modes).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="pitch-semitones">Pitch (semitones)</Label><Input id="pitch-semitones" type="number" min={-12} max={12} step={0.5} value={pitchSemitones} onChange={event => setPitchSemitones(Number(event.target.value))} /></div><div className="space-y-2"><Label htmlFor="tempo-transients">Transients</Label><Select value={transients} items={{ crisp: "Crisp", mixed: "Balanced", smooth: "Smooth" }} onValueChange={value => setTransients(value as Transients)}><SelectTrigger id="tempo-transients"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="crisp">Crisp</SelectItem><SelectItem value="mixed">Balanced</SelectItem><SelectItem value="smooth">Smooth</SelectItem></SelectContent></Select></div></div><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={preservePitch} onChange={event => setPreservePitch(event.target.checked)} />Preserve pitch</label><label className="flex items-center gap-2"><input type="checkbox" checked={preserveFormants} onChange={event => setPreserveFormants(event.target.checked)} />Preserve formants</label></div><p className="text-xs text-muted-foreground">Speed ratio {Number.isFinite(ratio) ? ratio.toFixed(2) : "—"}×. Browser preview changes playback speed only; the final render uses Rubber Band processing.</p>{extreme && <p role="status" className="text-sm text-amber-800">Extreme tempo changes can introduce audible artifacts.</p>}{!validRatio && <p role="alert" className="text-sm text-destructive">Choose a target between half and twice the source BPM.</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!validRatio} onClick={() => void togglePreview()}>{previewing ? <Pause /> : <Play />}{previewing ? "Pause preview" : "Preview tempo"}</Button><Button disabled={busy || !analysis || !validRatio || (Math.abs(ratio - 1) < 0.001 && pitchSemitones === 0)} onClick={() => void apply()}><SlidersHorizontal />Apply as new version</Button></div></CardContent></Card></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <Card><CardHeader><CardTitle>Tempo versions</CardTitle><CardDescription>Each result is a separate downloadable audio asset with lineage back to its source.</CardDescription></CardHeader><CardContent className="space-y-4">{variants.data?.items.length ? variants.data.items.map(item => <div key={item.id} className="space-y-2 rounded-md border p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{item.ratio.toFixed(2)}× tempo · {item.pitch_semitones.toFixed(1)} semitones</span><a className="underline" href={`/api/v1/assets/${item.asset_id}/download`} download>Download FLAC</a></div><audio controls preload="none" className="w-full" src={`/api/v1/assets/${item.asset_id}/stream`} aria-label={`Tempo version ${item.id}`} /></div>) : <p className="text-sm text-muted-foreground">No tempo variants yet.</p>}<Button variant="outline" onClick={() => void variants.reload()}><RefreshCw />Refresh versions</Button></CardContent></Card>
      <JobActivity song={song.id} />
    </div>}
  </>;
}
