import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Card, CardContent } from "@hungreegoat/studio-ui/components/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@hungreegoat/studio-ui/components/empty";
export function PageHeading({ eyebrow = "YOUR STUDIO", title, description, children }: { eyebrow?: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div className="max-w-2xl space-y-2"><p className="text-[10px] font-semibold tracking-[.18em] text-muted-foreground">{eyebrow}</p><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1><p className="text-sm leading-relaxed text-muted-foreground">{description}</p></div>{children}</div>;
}
export function EmptyPanel({ icon: Icon, title, description, href, action }: { icon: LucideIcon; title: string; description: string; href?: string; action?: string }) {
  return <Card><CardContent><Empty className="py-12 md:py-16"><EmptyHeader><EmptyMedia variant="icon"><Icon /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{href && <EmptyContent><Button variant="outline" render={<Link href={href} />} nativeButton={false}>{action}<ArrowUpRight /></Button></EmptyContent>}</Empty></CardContent></Card>;
}
