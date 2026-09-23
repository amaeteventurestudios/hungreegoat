"use client";
import { useState } from "react";
import type { AudioAsset,AssetLineage } from "@hungreegoat/studio-contracts";
import { useSession } from "@/hooks/use-session";
import { uploadAudio,domain } from "@/lib/domain-client";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Input } from "@hungreegoat/studio-ui/components/input";
import { Label } from "@hungreegoat/studio-ui/components/label";
import { Badge } from "@hungreegoat/studio-ui/components/badge";
import { Card,CardHeader,CardTitle,CardContent } from "@hungreegoat/studio-ui/components/card";
import { Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@hungreegoat/studio-ui/components/dialog";
export function AssetUpload({project,song,onUploaded}:{project:string;song:string|null;onUploaded:()=>void}){
 const {session}=useSession();const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [message,setMessage]=useState<string|null>(null);
 async function submit(event:React.SubmitEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const file=new FormData(form).get("file");if(!(file instanceof File)||!file.size){setError("Choose an audio file.");return;}setBusy(true);setError(null);setMessage(null);try{await uploadAudio(project,song,file,session?.csrf_token??null);form.reset();setMessage("Audio uploaded. Your source is preserved.");onUploaded();}catch(error){setError(error instanceof Error?error.message:"Upload failed.");}finally{setBusy(false);}}
 return <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-5"><Label htmlFor="audio-file">Upload audio</Label><div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"><Input id="audio-file" name="file" type="file" accept="audio/*" required className="w-full min-w-0 sm:flex-1" disabled={busy}/><Button type="submit" disabled={busy}>{busy?"Uploading…":"Upload audio"}</Button></div><p className="text-xs text-muted-foreground">Audio only · Up to 100 MiB · Every upload creates a new immutable source.</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}</form>;
}
export function AssetList({assets}:{assets:AudioAsset[]}){
 return <div className="space-y-4">{assets.length===0?<p className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">No audio assets yet. Upload a source to start your song’s history.</p>:assets.map(asset=><AssetCard key={asset.id} asset={asset}/>)}</div>;
}
function AssetCard({asset}:{asset:AudioAsset}){
 const [history,setHistory]=useState<AssetLineage[]|null>(null);const [error,setError]=useState<string|null>(null);
 function loadHistory(){setError(null);void domain.lineage(asset.id).then(result=>setHistory(result.items)).catch(error=>setError(error instanceof Error?error.message:"History unavailable."));}
 return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="min-w-0 break-all">{asset.original_filename}</CardTitle><Badge variant="secondary">{asset.kind}</Badge></div><p className="text-xs text-muted-foreground">{(asset.byte_size/1024/1024).toFixed(2)} MiB · {asset.duration_seconds?.toFixed(1)??"—"} sec · {asset.sample_rate??"—"} Hz · {new Date(asset.created_at).toLocaleDateString()}</p></CardHeader><CardContent className="space-y-4"><audio controls preload="none" src={`/api/v1/assets/${asset.id}/stream`} className="w-full" aria-label={`Listen to ${asset.original_filename}`}/><div className="flex flex-wrap gap-3"><Button variant="outline" render={<a href={`/api/v1/assets/${asset.id}/download`} download/>} nativeButton={false}>Download audio</Button><Dialog><DialogTrigger render={<Button variant="ghost"/>} onClick={loadHistory}>View history</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Asset history</DialogTitle><DialogDescription className="break-all">{asset.original_filename}</DialogDescription></DialogHeader>{error?<div role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={loadHistory}>Retry history</Button></div>:!history?<p role="status">Loading history…</p>:history.length===0?<p className="text-sm text-muted-foreground">Original uploaded source. No transformations yet.</p>:<ol className="space-y-3">{history.map(item=><li key={item.id} className="rounded-lg border p-3"><p className="font-medium">{item.operation}</p><p className="break-all text-xs text-muted-foreground">Source {item.parent_asset_id}<br/>Result {item.child_asset_id}</p></li>)}</ol>}<p className="break-all text-xs text-muted-foreground">Asset ID: {asset.id}</p></DialogContent></Dialog></div></CardContent></Card>;
}
