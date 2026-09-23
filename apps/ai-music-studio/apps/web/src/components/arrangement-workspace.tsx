"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ListMusic, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ArrangementRevision, ArrangementSection, GenerationVersion, MusicGeneration } from "@hungreegoat/studio-contracts";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import { useSongContext } from "@/hooks/use-song-context";
import { domain } from "@/lib/domain-client";
import { EmptyPanel, PageHeading } from "@/components/page-primitives";
import { Badge } from "@hungreegoat/studio-ui/components/badge";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hungreegoat/studio-ui/components/card";
import { Input } from "@hungreegoat/studio-ui/components/input";
import { Label } from "@hungreegoat/studio-ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hungreegoat/studio-ui/components/select";
import { Skeleton } from "@hungreegoat/studio-ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@hungreegoat/studio-ui/components/tabs";
import { Textarea } from "@hungreegoat/studio-ui/components/textarea";

const kinds = ["intro", "verse", "chorus", "bridge", "outro"] as const;
const defaultSections: ArrangementSection[] = kinds.map((kind, index) => ({
  kind, name: kind[0].toUpperCase() + kind.slice(1),
  duration_seconds: [16, 32, 32, 16, 16][index], energy: [25, 50, 85, 55, 30][index],
  instrumentation: [], production_notes: "", vocal_instructions: "",
}));
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function ArrangementEditor({ version, latest, displayed, onSaved }: {
  version: GenerationVersion; latest: ArrangementRevision | undefined; displayed: ArrangementRevision | undefined;
  onSaved: () => Promise<void>;
}) {
  const { session } = useSession();
  const [sections, setSections] = useState<ArrangementSection[]>(() => structuredClone(displayed?.sections ?? defaultSections));
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = sections.reduce((sum, section) => sum + section.duration_seconds, 0);
  const section = sections[selected];
  const original = displayed?.sections ?? defaultSections;
  const dirty = JSON.stringify(sections) !== JSON.stringify(original);

  function change(patch: Partial<ArrangementSection>) {
    setSections(previous => previous.map((item, index) => index === selected ? { ...item, ...patch } : item));
  }
  function move(direction: -1 | 1) {
    const next = selected + direction;
    if (next < 0 || next >= sections.length) return;
    setSections(previous => { const value = [...previous]; [value[selected], value[next]] = [value[next], value[selected]]; return value; });
    setSelected(next);
  }
  function add() {
    if (sections.length >= 32) return;
    setSections(previous => [...previous, { kind: "bridge", name: "New section", duration_seconds: 16, energy: 50, instrumentation: [], production_notes: "", vocal_instructions: "" }]);
    setSelected(sections.length);
  }
  async function save() {
    setBusy(true); setError(null);
    try {
      await domain.createArrangement(version.id, { base_revision: latest?.revision ?? 0, sections }, session?.csrf_token ?? null);
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Arrangement could not be saved."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Section timeline</h2><p className="text-sm text-muted-foreground">Structural directions only. The source audio remains unchanged; this provider workflow does not regenerate individual sections.</p></div><Badge variant="outline">{time(total)} planned</Badge></div>
    <div className="flex min-h-28 gap-1 overflow-x-auto rounded-lg border bg-muted/20 p-2" aria-label="Arrangement timeline">{sections.map((item, index) => <button key={index} type="button" aria-label={`Select ${item.name}`} aria-pressed={selected === index} onClick={() => setSelected(index)} style={{ flexGrow: item.duration_seconds }} className={`min-w-20 rounded-md border p-3 text-left transition-colors ${selected === index ? "border-primary bg-primary/10" : "bg-card hover:bg-muted"}`}><span className="block truncate text-sm font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{time(item.duration_seconds)} · {item.energy}%</span></button>)}</div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]"><Card><CardHeader><CardTitle>Section inspector</CardTitle><CardDescription>Edit the selected section, then save a new immutable revision.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="section-name">Section name</Label><Input id="section-name" maxLength={80} value={section.name} onChange={event => change({ name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="section-kind">Section type</Label><Select value={section.kind} items={Object.fromEntries(kinds.map(kind => [kind, kind[0].toUpperCase() + kind.slice(1)]))} onValueChange={value => change({ kind: value as ArrangementSection["kind"] })}><SelectTrigger id="section-kind"><SelectValue /></SelectTrigger><SelectContent>{kinds.map(kind => <SelectItem key={kind} value={kind}>{kind[0].toUpperCase() + kind.slice(1)}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="section-duration">Duration (seconds)</Label><Input id="section-duration" type="number" min={3} max={600} value={section.duration_seconds} onChange={event => change({ duration_seconds: Number(event.target.value) })} /></div><div className="space-y-2"><Label htmlFor="section-energy">Energy (0–100)</Label><Input id="section-energy" type="number" min={0} max={100} value={section.energy} onChange={event => change({ energy: Number(event.target.value) })} /></div></div>
      <div className="space-y-2"><Label htmlFor="section-instruments">Instrumentation</Label><Input id="section-instruments" value={section.instrumentation.join(", ")} onChange={event => change({ instrumentation: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} placeholder="Piano, bass, drums" /></div>
      <div className="space-y-2"><Label htmlFor="section-production">Production notes</Label><Textarea id="section-production" maxLength={2000} value={section.production_notes} onChange={event => change({ production_notes: event.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="section-vocals">Vocal instructions</Label><Textarea id="section-vocals" maxLength={2000} value={section.vocal_instructions} onChange={event => change({ vocal_instructions: event.target.value })} /></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={selected === 0} onClick={() => move(-1)}><ArrowUp />Earlier</Button><Button size="sm" variant="outline" disabled={selected === sections.length - 1} onClick={() => move(1)}><ArrowDown />Later</Button><Button size="sm" variant="outline" disabled={sections.length >= 32} onClick={add}><Plus />Add section</Button><Button size="sm" variant="outline" disabled={sections.length <= 1} onClick={() => { setSections(previous => previous.filter((_, index) => index !== selected)); setSelected(Math.max(0, selected - 1)); }}><Trash2 />Remove</Button></div>
    </CardContent></Card><Card><CardHeader><CardTitle>Revision</CardTitle><CardDescription>{displayed ? `Viewing revision ${displayed.revision}` : "Start from a five-section template"}</CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Each save creates a new plan revision linked to this approved version. Your original audio and earlier revisions remain intact.</p><p className="text-sm">{sections.length} sections · {time(total)} planned</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy || (!dirty && !!latest && displayed?.id === latest.id)} onClick={() => void save()}><Save />{busy ? "Saving…" : latest ? "Save new revision" : "Save first revision"}</Button></CardContent></Card></div>
  </div>;
}

export function ArrangementWorkspace() {
  const { song } = useSongContext();
  const generations = useResource(`arrangement-generations:${song?.id ?? "none"}`, () => song ? domain.generations(song.id) : Promise.resolve({ items: [] as MusicGeneration[] }));
  const generationIds = generations.data?.items.map(item => item.id).join(",") ?? "";
  const versions = useResource(`arrangement-versions:${generationIds}`, async () => {
    const lists = await Promise.all((generations.data?.items ?? []).map(item => domain.generationVersions(item.id)));
    return lists.flatMap(list => list.items).filter(item => item.approved && item.asset_id);
  });
  const [versionId, setVersionId] = useState<string | null>(null);
  const version = versions.data?.find(item => item.id === versionId) ?? versions.data?.[0];
  const arrangements = useResource(`arrangements:${version?.id ?? "none"}`, () => version ? domain.arrangements(version.id) : Promise.resolve({ items: [] as ArrangementRevision[] }));
  const [viewId, setViewId] = useState<string | null>(null);
  const [tab, setTab] = useState("timeline");
  const latest = arrangements.data?.items[0];
  const displayed = arrangements.data?.items.find(item => item.id === viewId) ?? latest;

  if (!song) return <><PageHeading title="Arrangement" description="Shape the sections of an approved version." /><EmptyPanel icon={ListMusic} title="Choose a song" description="Arrange a generated version after reviewing it." href="/songs/new" action="Create a song" /></>;
  return <><PageHeading eyebrow="CREATE • SHAPE" title="Arrangement" description={`Plan the musical journey for “${song.title}”.`} />
    {(generations.error || versions.error || arrangements.error) && <p role="alert" className="mb-4 text-sm text-destructive">{generations.error ?? versions.error ?? arrangements.error}</p>}
    {generations.loading || versions.loading || arrangements.loading ? <Skeleton className="h-72 w-full" /> : !versions.data?.length ? <EmptyPanel icon={ListMusic} title="Approve a version first" description="Generate music, review its waveforms, then approve a version to build a non-destructive section plan." href={`/compare?song_id=${song.id}`} action="Review versions" /> : <>
      <div className="mb-5 max-w-sm space-y-2"><Label htmlFor="arrangement-source">Approved source version</Label><Select value={version?.id ?? null} items={Object.fromEntries(versions.data.map((item, index) => [item.id, `Approved version ${index + 1}`]))} onValueChange={value => { setVersionId(value); setViewId(null); }}><SelectTrigger id="arrangement-source"><SelectValue /></SelectTrigger><SelectContent>{versions.data.map((item, index) => <SelectItem key={item.id} value={item.id}>Approved version {index + 1}</SelectItem>)}</SelectContent></Select></div>
      <Tabs value={tab} onValueChange={setTab}><TabsList className="mb-5"><TabsTrigger value="timeline">Timeline</TabsTrigger><TabsTrigger value="history">Revision history</TabsTrigger></TabsList><TabsContent value="timeline">{version && <ArrangementEditor key={`${version.id}:${displayed?.id ?? "new"}`} version={version} latest={latest} displayed={displayed} onSaved={async () => { setViewId(null); setTab("timeline"); await arrangements.reload(); }} />}</TabsContent><TabsContent value="history"><Card><CardHeader><CardTitle>Immutable revisions</CardTitle><CardDescription>Select an older plan to inspect or restore it as a new revision.</CardDescription></CardHeader><CardContent className="space-y-2">{arrangements.data?.items.length ? arrangements.data.items.map(item => <Button key={item.id} variant="outline" className="flex w-full justify-between" onClick={() => { setViewId(item.id); setTab("timeline"); }}>Revision {item.revision} · {item.sections.length} sections <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span></Button>) : <p className="text-sm text-muted-foreground">No revisions yet. Save the first section plan above.</p>}</CardContent></Card></TabsContent></Tabs>
      <Button className="mt-5" variant="outline" render={<Link href={`/compare?song_id=${song.id}`} />} nativeButton={false}>Back to listening review</Button>
    </>}
  </>;
}
