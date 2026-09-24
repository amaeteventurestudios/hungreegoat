"use client";

import { Download, Disc3, Package, Pause, Play, RefreshCw, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioAsset } from "@hungreegoat/studio-contracts";
import { JobActivity } from "@/components/job-activity";
import { EmptyPanel, PageHeading } from "@/components/page-primitives";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import { useSongContext } from "@/hooks/use-song-context";
import { domain } from "@/lib/domain-client";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@hungreegoat/studio-ui/components/badge";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hungreegoat/studio-ui/components/card";
import { Input } from "@hungreegoat/studio-ui/components/input";
import { Label } from "@hungreegoat/studio-ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hungreegoat/studio-ui/components/select";
import { Skeleton } from "@hungreegoat/studio-ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@hungreegoat/studio-ui/components/tabs";

const assetName = (asset: AudioAsset) => `${asset.kind} · ${asset.original_filename}`;
const queuedFailure = (state: string) => state === "failed" || state === "cancelled";

export function MasteringWorkspace() {
  const { song } = useSongContext();
  const { session } = useSession();
  const assets = useResource(`mastering-assets:${song?.id ?? "none"}`, () => song ? domain.assets(undefined, song.id) : Promise.resolve({ items: [] as AudioAsset[] }));
  const [sourceId, setSourceId] = useState<string | null>(null);
  const source = assets.data?.items.find(item => item.id === sourceId) ?? assets.data?.items[0];
  const masters = useResource(`masters:${source?.id ?? "none"}`, () => source ? domain.masters(source.id) : Promise.resolve({ items: [] }));
  const stemSets = useResource(`mastering-stem-sets:${source?.id ?? "none"}`, () => source ? domain.stemSets(source.id) : Promise.resolve({ items: [] }));
  const selectedStemSet = stemSets.data?.items[0];
  const stemExports = useResource(`stem-package:${selectedStemSet?.id ?? "none"}`, () => selectedStemSet ? domain.stemSetExports(selectedStemSet.id) : Promise.resolve({ items: [] }));
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [targetLufs, setTargetLufs] = useState(-14);
  const [truePeak, setTruePeak] = useState(-1);
  const [masterPending, setMasterPending] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [stemsPending, setStemsPending] = useState(false);
  const [masterJobId, setMasterJobId] = useState<string | null>(null);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [stemsJobId, setStemsJobId] = useState<string | null>(null);
  const [exportSourceId, setExportSourceId] = useState<string | null>(null);
  const [format, setFormat] = useState<"wav" | "mp3">("wav");
  const [bitDepth, setBitDepth] = useState<16 | 24>(24);
  const [bitrate, setBitrate] = useState<128 | 192 | 256 | 320>(320);
  const [masterId, setMasterId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<"source" | "master" | null>(null);
  const [activeTab, setActiveTab] = useState("mastering");
  const sourcePlayer = useRef<HTMLAudioElement>(null);
  const masterPlayer = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedMaster = masters.data?.items.find(item => item.id === masterId) ?? masters.data?.items[0];
  const exportSources = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of assets.data?.items ?? []) map.set(item.id, assetName(item));
    for (const item of masters.data?.items ?? []) map.set(item.asset_id, `Master · ${new Date(item.created_at).toLocaleString()}`);
    return [...map].map(([id, label]) => ({ id, label }));
  }, [assets.data?.items, masters.data?.items]);
  const exportSource = exportSources.find(item => item.id === exportSourceId)?.id ?? selectedMaster?.asset_id ?? source?.id;
  const exports = useResource(`exports:${exportSource ?? "none"}`, () => exportSource ? domain.exports(exportSource) : Promise.resolve({ items: [] }));
  const reloadAssets = assets.reload;
  const reloadMasters = masters.reload;
  const reloadExports = exports.reload;
  const reloadStemExports = stemExports.reload;

  useEffect(() => {
    if (!masterPending) return;
    const timer = window.setInterval(() => {
      void reloadMasters(); void reloadAssets();
      if (masterJobId) void apiRequest<{ state: string; error_code: string | null }>(`/jobs/${masterJobId}`).then(job => {
        if (job.state === "succeeded") { setMasterPending(false); setMessage("Master finished. It is a new immutable asset ready for comparison and delivery."); void reloadMasters(); void reloadAssets(); }
        else if (queuedFailure(job.state)) { setMasterPending(false); setError(`Mastering ${job.state}${job.error_code ? ` (${job.error_code})` : ""}.`); }
      }).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [masterPending, masterJobId, reloadMasters, reloadAssets]);
  useEffect(() => {
    if (!exportPending) return;
    const timer = window.setInterval(() => {
      void reloadExports();
      if (exportJobId) void apiRequest<{ state: string; error_code: string | null }>(`/jobs/${exportJobId}`).then(job => {
        if (job.state === "succeeded") { setExportPending(false); setMessage("Export finished. Your delivery file is ready to download."); void reloadExports(); }
        else if (queuedFailure(job.state)) { setExportPending(false); setError(`Export ${job.state}${job.error_code ? ` (${job.error_code})` : ""}.`); }
      }).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [exportPending, exportJobId, reloadExports]);
  useEffect(() => {
    if (!stemsPending) return;
    const timer = window.setInterval(() => {
      void reloadStemExports();
      if (stemsJobId) void apiRequest<{ state: string; error_code: string | null }>(`/jobs/${stemsJobId}`).then(job => {
        if (job.state === "succeeded") { setStemsPending(false); setMessage("Stem package finished. Your ZIP is ready to download."); void reloadStemExports(); }
        else if (queuedFailure(job.state)) { setStemsPending(false); setError(`Stem package ${job.state}${job.error_code ? ` (${job.error_code})` : ""}.`); }
      }).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [stemsPending, stemsJobId, reloadStemExports]);
  useEffect(() => () => { sourcePlayer.current?.pause(); masterPlayer.current?.pause(); }, []);

  function changeSource(value: string | null) {
    sourcePlayer.current?.pause(); masterPlayer.current?.pause(); setPlaying(null); setSourceId(value); setMasterId(null); setExportSourceId(null); setReferenceId(null); setError(null); setMessage(null);
  }
  async function toggle(which: "source" | "master") {
    const player = which === "source" ? sourcePlayer.current : masterPlayer.current;
    const other = which === "source" ? masterPlayer.current : sourcePlayer.current;
    if (!player) return;
    if (playing === which) { player.pause(); setPlaying(null); return; }
    other?.pause();
    try { await player.play(); setPlaying(which); } catch { setError("Browser playback could not start. Try again after interacting with the page."); }
  }
  async function createMaster() {
    if (!source) return;
    setError(null); setMessage(null); setMasterPending(true);
    try {
      const queued = await domain.requestMaster(source.id, { idempotency_key: crypto.randomUUID(), ...(referenceId ? { reference_asset_id: referenceId } : {}), target_lufs: targetLufs, true_peak_dbtp: truePeak }, session?.csrf_token ?? null);
      setMasterJobId(queued.job_id); setMessage("Mastering queued. Your source mix and reference remain unchanged.");
    } catch (cause) { setMasterPending(false); setError(cause instanceof Error ? cause.message : "Mastering could not start."); }
  }
  async function createExport() {
    if (!exportSource) return;
    setError(null); setMessage(null); setExportPending(true);
    try {
      const queued = await domain.requestExport(exportSource, { idempotency_key: crypto.randomUUID(), format, ...(format === "wav" ? { bit_depth: bitDepth } : { mp3_bitrate_kbps: bitrate }) }, session?.csrf_token ?? null);
      setExportJobId(queued.job_id); setMessage(`${format.toUpperCase()} export queued. Delivery output will appear below.`);
    } catch (cause) { setExportPending(false); setError(cause instanceof Error ? cause.message : "Export could not start."); }
  }
  async function createStemPackage() {
    if (!selectedStemSet) return;
    setError(null); setMessage(null); setStemsPending(true);
    try { const queued = await domain.requestStemSetExport(selectedStemSet.id, crypto.randomUUID(), session?.csrf_token ?? null); setStemsJobId(queued.job_id); setMessage("Stem ZIP package queued. The individual stems remain unchanged."); }
    catch (cause) { setStemsPending(false); setError(cause instanceof Error ? cause.message : "Stem package could not start."); }
  }

  if (!song) return <><PageHeading title="Mastering & Export" description="Create release-ready masters and delivery files without changing the source." /><EmptyPanel icon={Disc3} title="Choose a song" description="Start with a song and audio version to master." href="/songs/new" action="Create a song" /></>;
  // Background refreshes must not remount the workspace: doing so resets the
  // selected tab and interrupts A/B playback while a job is running.
  const loading = (assets.loading && !assets.data) || (masters.loading && !masters.data) || (stemSets.loading && !stemSets.data) || (exports.loading && !exports.data) || (stemExports.loading && !stemExports.data);
  return <><PageHeading eyebrow="FINISH • DELIVER" title="Mastering & Export" description={`Finish “${song.title}” with versioned masters and downloadable delivery files.`} />
    {(assets.error || masters.error || stemSets.error || exports.error || stemExports.error || error) && <p role="alert" className="mb-4 text-sm text-destructive">{error ?? assets.error ?? masters.error ?? stemSets.error ?? exports.error ?? stemExports.error}</p>}
    {loading ? <Skeleton className="h-72 w-full" /> : !assets.data?.items.length ? <EmptyPanel icon={Disc3} title="Add a mix first" description="Upload, generate, or render an audio version before mastering." href={`/songs/${song.id}`} action="Open song" /> : <div className="space-y-6">
      <div className="max-w-xl space-y-2"><Label htmlFor="master-source">Source mix</Label><Select value={source?.id ?? null} items={Object.fromEntries(assets.data.items.map(item => [item.id, assetName(item)]))} onValueChange={changeSource}><SelectTrigger id="master-source"><SelectValue /></SelectTrigger><SelectContent>{assets.data.items.map(item => <SelectItem key={item.id} value={item.id}>{assetName(item)}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Mastering creates a separate, lineage-tracked result; it never overwrites this mix.</p></div>
      <Tabs value={activeTab} onValueChange={setActiveTab}><TabsList className="h-auto max-w-full flex-wrap justify-start"><TabsTrigger value="mastering">Mastering workspace</TabsTrigger><TabsTrigger value="history">Master versions</TabsTrigger><TabsTrigger value="delivery">Exports & delivery</TabsTrigger></TabsList>
        <TabsContent value="mastering" className="mt-5 space-y-5"><div className="grid items-start gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Mastering setup</CardTitle><CardDescription>Matchering uses the selected reference as tonal guidance while preserving immutable source lineage.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="master-reference">Reference track <span className="text-muted-foreground">(optional)</span></Label><Select value={referenceId} items={Object.fromEntries((assets.data.items.filter(item => item.id !== source?.id)).map(item => [item.id, assetName(item)]))} onValueChange={setReferenceId}><SelectTrigger id="master-reference"><SelectValue placeholder="No reference track" /></SelectTrigger><SelectContent>{assets.data.items.filter(item => item.id !== source?.id).map(item => <SelectItem key={item.id} value={item.id}>{assetName(item)}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="target-lufs">Target loudness (LUFS)</Label><Input id="target-lufs" type="number" min={-24} max={-6} step={0.5} value={targetLufs} onChange={event => setTargetLufs(Number(event.target.value))} /></div><div className="space-y-2"><Label htmlFor="true-peak">True peak (dBTP)</Label><Input id="true-peak" type="number" min={-6} max={0} step={0.1} value={truePeak} onChange={event => setTruePeak(Number(event.target.value))} /></div></div><p className="text-xs text-muted-foreground">A conservative −14 LUFS / −1.0 dBTP target is a good streaming starting point.</p><Button disabled={masterPending || !Number.isFinite(targetLufs) || !Number.isFinite(truePeak)} onClick={() => void createMaster()}><Disc3 />{masterPending ? "Mastering…" : "Create master"}</Button></CardContent></Card>
          <Card><CardHeader><CardTitle>Pre / post A/B</CardTitle><CardDescription>Switch between the source mix and the selected master for an honest comparison.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Button variant={playing === "source" ? "default" : "outline"} onClick={() => void toggle("source")}><Volume2 />{playing === "source" ? "Playing source" : "Play source"}</Button><Button variant={playing === "master" ? "default" : "outline"} disabled={!selectedMaster} onClick={() => void toggle("master")}>{playing === "master" ? <Pause /> : <Play />}{playing === "master" ? "Pause master" : "Play master"}</Button></div>{source && <audio ref={sourcePlayer} src={`/api/v1/assets/${source.id}/stream`} preload="metadata" onEnded={() => setPlaying(null)} className="sr-only" aria-label="Source mix playback" />}{selectedMaster ? <><div className="space-y-2"><Label htmlFor="ab-master">Master version</Label><Select value={selectedMaster.id} items={Object.fromEntries(masters.data?.items.map(item => [item.id, `Master · ${new Date(item.created_at).toLocaleString()}`]) ?? [])} onValueChange={setMasterId}><SelectTrigger id="ab-master"><SelectValue /></SelectTrigger><SelectContent>{masters.data?.items.map(item => <SelectItem key={item.id} value={item.id}>Master · {new Date(item.created_at).toLocaleString()}</SelectItem>)}</SelectContent></Select></div><audio ref={masterPlayer} src={`/api/v1/assets/${selectedMaster.asset_id}/stream`} preload="metadata" onEnded={() => setPlaying(null)} className="w-full" controls aria-label="Master playback" /><p className="text-xs text-muted-foreground">{selectedMaster.engine} · {selectedMaster.settings.target_lufs ?? "—"} LUFS · {selectedMaster.settings.true_peak_dbtp ?? "—"} dBTP</p></> : <p className="text-sm text-muted-foreground">Create a master to unlock A/B comparison.</p>}</CardContent></Card></div></TabsContent>
        <TabsContent value="history" className="mt-5"><Card><CardHeader><CardTitle>Master history</CardTitle><CardDescription>Every master is retained as a separate deliverable with source and reference lineage.</CardDescription></CardHeader><CardContent className="space-y-3">{masters.data?.items.length ? masters.data.items.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{item.engine} master</p><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()} · {item.settings.target_lufs ?? "—"} LUFS · {item.settings.true_peak_dbtp ?? "—"} dBTP</p></div><div className="flex gap-2"><Button size="sm" variant={item.id === selectedMaster?.id ? "default" : "outline"} onClick={() => setMasterId(item.id)}>A/B select</Button><a className="inline-flex items-center gap-1 text-sm underline" href={`/api/v1/assets/${item.asset_id}/download`} download><Download className="size-4" />Download</a></div></div>) : <p className="text-sm text-muted-foreground">No masters yet.</p>}<Button variant="outline" onClick={() => void masters.reload()}><RefreshCw />Refresh masters</Button></CardContent></Card></TabsContent>
        <TabsContent value="delivery" className="mt-5 space-y-5"><div className="grid items-start gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Audio delivery</CardTitle><CardDescription>Render a dedicated WAV or MP3 delivery asset from a mix or master.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="export-source">Export source</Label><Select value={exportSource ?? null} items={Object.fromEntries(exportSources.map(item => [item.id, item.label]))} onValueChange={setExportSourceId}><SelectTrigger id="export-source"><SelectValue /></SelectTrigger><SelectContent>{exportSources.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="export-format">Format</Label><Select value={format} items={{ wav: "WAV", mp3: "MP3" }} onValueChange={value => setFormat(value as "wav" | "mp3")}><SelectTrigger id="export-format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wav">WAV</SelectItem><SelectItem value="mp3">MP3</SelectItem></SelectContent></Select></div>{format === "wav" ? <div className="space-y-2"><Label htmlFor="wav-depth">Bit depth</Label><Select value={String(bitDepth)} items={{ "16": "16-bit", "24": "24-bit" }} onValueChange={value => setBitDepth(Number(value) as 16 | 24)}><SelectTrigger id="wav-depth"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="16">16-bit</SelectItem><SelectItem value="24">24-bit</SelectItem></SelectContent></Select></div> : <div className="space-y-2"><Label htmlFor="mp3-bitrate">MP3 bitrate</Label><Select value={String(bitrate)} items={{ "128": "128 kbps", "192": "192 kbps", "256": "256 kbps", "320": "320 kbps" }} onValueChange={value => setBitrate(Number(value) as 128 | 192 | 256 | 320)}><SelectTrigger id="mp3-bitrate"><SelectValue /></SelectTrigger><SelectContent>{[128, 192, 256, 320].map(value => <SelectItem key={value} value={String(value)}>{value} kbps</SelectItem>)}</SelectContent></Select></div>}<Button disabled={exportPending || !exportSource} onClick={() => void createExport()}><Download />{exportPending ? "Exporting…" : `Create ${format.toUpperCase()} export`}</Button></CardContent></Card>
          <Card><CardHeader><CardTitle>Stems package</CardTitle><CardDescription>Bundle the selected mix’s existing stem set as a downloadable ZIP.</CardDescription></CardHeader><CardContent className="space-y-4">{selectedStemSet ? <><Badge variant="outline">{selectedStemSet.stems.length} stems · {selectedStemSet.engine}</Badge><Button disabled={stemsPending} onClick={() => void createStemPackage()}><Package />{stemsPending ? "Packaging…" : "Create stems ZIP"}</Button>{stemExports.data?.items.map(item => <a key={item.id} className="flex items-center gap-2 text-sm underline" href={`/api/v1/stem-packages/${item.id}/download`} download><Download className="size-4" />Stem package · {new Date(item.created_at).toLocaleString()}</a>)}</> : <p className="text-sm text-muted-foreground">No stem set exists for this source mix. Create one in Stems & Mixing first.</p>}<Button variant="outline" onClick={() => { void stemSets.reload(); void stemExports.reload(); }}><RefreshCw />Refresh packages</Button></CardContent></Card></div><Card><CardHeader><CardTitle>Delivery history</CardTitle><CardDescription>Exports are immutable delivery assets derived from the selected source.</CardDescription></CardHeader><CardContent className="space-y-3">{exports.data?.items.length ? exports.data.items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><span>{item.format.toUpperCase()} · {item.settings.bit_depth ? `${item.settings.bit_depth}-bit` : `${item.settings.mp3_bitrate_kbps} kbps`} · {new Date(item.created_at).toLocaleString()}</span><a className="inline-flex items-center gap-1 text-sm underline" href={`/api/v1/assets/${item.asset_id}/download`} download><Download className="size-4" />Download</a></div>) : <p className="text-sm text-muted-foreground">No delivery exports for this source yet.</p>}<Button variant="outline" onClick={() => void exports.reload()}><RefreshCw />Refresh exports</Button></CardContent></Card></TabsContent>
      </Tabs>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}<JobActivity song={song.id} />
    </div>}
  </>;
}
