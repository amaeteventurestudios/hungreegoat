"use client";
import { useState } from "react";
import type { StudioSettings } from "@hungreegoat/studio-contracts";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Input } from "@hungreegoat/studio-ui/components/input";
import { Label } from "@hungreegoat/studio-ui/components/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@hungreegoat/studio-ui/components/select";
import { useSession } from "@/hooks/use-session";
type Section = "workspace" | "appearance" | "audio" | "exports";
export function SettingsForm({ section, settings, save, saving }: { section: Section; settings: StudioSettings; save: (patch: Partial<StudioSettings>) => Promise<StudioSettings>; saving: boolean }) {
 const [message,setMessage] = useState<string|null>(null);
 async function submit(event: React.SubmitEvent<HTMLFormElement>) {
  event.preventDefault(); const form = new FormData(event.currentTarget);setMessage(null);
  let patch: Partial<StudioSettings>;
  if(section === "workspace") patch={workspace:{name:String(form.get("name"))}};
  else if(section === "appearance") patch={appearance:{theme:String(form.get("theme")) as StudioSettings["appearance"]["theme"]}};
  else if(section === "audio") patch={audio:{sample_rate:Number(form.get("sample_rate")) as 44100|48000,bpm:Number(form.get("bpm"))}};
  else patch={exports:{format:String(form.get("format")) as "wav"|"mp3",bit_depth:Number(form.get("bit_depth")) as 16|24,mp3_bitrate_kbps:Number(form.get("mp3_bitrate_kbps")) as 128|192|256|320}};
  try { await save(patch);setMessage("Settings saved."); } catch { setMessage("Settings were not saved. Review the error and try again."); }
 }
 return <form onSubmit={submit} className="max-w-lg space-y-5">
  {section === "workspace" && <div className="space-y-2"><Label htmlFor="workspace-name">Workspace name</Label><Input id="workspace-name" name="name" defaultValue={settings.workspace.name} required maxLength={200} /></div>}
  {section === "appearance" && <Choice name="theme" label="Theme" value={settings.appearance.theme} options={{light:"Light",dark:"Dark",system:"System"}} />}
  {section === "audio" && <><Choice name="sample_rate" label="Sample rate" value={String(settings.audio.sample_rate)} options={{44100:"44.1 kHz",48000:"48 kHz"}} /><div className="space-y-2"><Label htmlFor="audio-bpm">Default BPM</Label><Input id="audio-bpm" name="bpm" type="number" min={30} max={300} defaultValue={settings.audio.bpm} required /></div></>}
  {section === "exports" && <><Choice name="format" label="Export format" value={settings.exports.format} options={{wav:"WAV",mp3:"MP3"}} /><Choice name="bit_depth" label="WAV bit depth" value={String(settings.exports.bit_depth)} options={{16:"16 bit",24:"24 bit"}} /><Choice name="mp3_bitrate_kbps" label="MP3 bitrate" value={String(settings.exports.mp3_bitrate_kbps)} options={{128:"128 kbps",192:"192 kbps",256:"256 kbps",320:"320 kbps"}} /></>}
  <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
 </form>;
}
function Choice({name,label,value,options}:{name:string;label:string;value:string;options:Record<string,string>}) {
 return <div className="space-y-2"><Label htmlFor={`setting-${name}`}>{label}</Label><Select name={name} defaultValue={value} items={options}><SelectTrigger id={`setting-${name}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(options).map(([value,label])=><SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div>;
}
export function PasswordForm() {
 const {changePassword}=useSession();const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 async function submit(event:React.SubmitEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);setError(null);if(data.get("next")!==data.get("confirm")){setError("The new passwords do not match.");return;}setBusy(true);try{await changePassword(String(data.get("current")),String(data.get("next")));}catch(error){setError(error instanceof Error?error.message:"Could not change password.");}finally{setBusy(false);}}
 return <form onSubmit={submit} className="mt-8 max-w-lg space-y-4 border-t pt-6"><h3 className="font-medium">Change password</h3><p className="text-sm text-muted-foreground">Changing your password signs out all sessions.</p>{[{name:"current",label:"Current password",complete:"current-password"},{name:"next",label:"New password",complete:"new-password"},{name:"confirm",label:"Confirm new password",complete:"new-password"}].map(field=><div className="space-y-2" key={field.name}><Label htmlFor={`password-${field.name}`}>{field.label}</Label><Input id={`password-${field.name}`} name={field.name} type="password" autoComplete={field.complete} minLength={field.name==="current"?1:12} required /></div>)}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" variant="outline" disabled={busy}>{busy?"Changing password…":"Change password"}</Button></form>;
}
