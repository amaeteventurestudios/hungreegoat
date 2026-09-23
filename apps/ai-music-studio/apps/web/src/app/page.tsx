import { AudioLines, Sparkles, Layers3, Disc3, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@hungreegoat/studio-ui/components/card";
import { Badge } from "@hungreegoat/studio-ui/components/badge";
import { HealthStatus } from "@/components/health-status";
export default function Home() {
  return <div className="min-h-screen">
    <header className="border-b bg-card"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
      <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><AudioLines /></div><div><p className="text-base font-semibold tracking-tight">HUNGREE GOAT</p><p className="text-xs text-muted-foreground">AI MUSIC STUDIO</p></div></div>
      <Badge variant="secondary">Your independent workspace</Badge>
    </div></header>
    <main className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:py-20">
      <section className="max-w-2xl space-y-5"><p className="text-xs font-semibold tracking-widest text-muted-foreground">MAKE SOMETHING THAT MOVES YOU</p><h1 className="text-4xl font-semibold tracking-tight md:text-6xl">An idea is just<br />the beginning.</h1><p className="max-w-xl text-lg leading-relaxed text-muted-foreground">A dedicated space to shape your sound, explore versions, and take your next track from a first spark to a final master.</p></section>
      <div className="grid gap-5 md:grid-cols-3">{[
        { icon: Sparkles, title: "Find your sound", text: "Turn a creative brief into a production plan and explore new musical directions." },
        { icon: Layers3, title: "Make it your own", text: "Compare versions, shape the arrangement, and bring every layer into focus." },
        { icon: Disc3, title: "Finish with intention", text: "Refine your mix, master your track, and keep every version in one place." },
      ].map(({ icon: Icon, title, text }) => <Card key={title}><CardHeader><Icon className="mb-3 size-6 text-amber-700" /><CardTitle>{title}</CardTitle><CardDescription className="leading-relaxed">{text}</CardDescription></CardHeader><CardContent><ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" /></CardContent></Card>)}</div>
      <footer className="flex flex-col gap-4 border-t pt-6"><HealthStatus /><p className="text-xs text-muted-foreground">Every idea deserves room to grow. Every version stays yours.</p></footer>
    </main>
  </div>;
}
