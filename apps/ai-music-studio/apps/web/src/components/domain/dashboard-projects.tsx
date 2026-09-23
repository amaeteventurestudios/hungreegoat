"use client";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { useResource } from "@/hooks/use-resource";
import { domain } from "@/lib/domain-client";
import { EmptyPanel } from "@/components/page-primitives";
import { Card,CardHeader,CardTitle,CardDescription } from "@hungreegoat/studio-ui/components/card";
import { Skeleton } from "@hungreegoat/studio-ui/components/skeleton";
import { ResourceError } from "@/components/domain/project-pages";
export function DashboardProjects(){const {data,error,reload}=useResource("dashboard-projects",()=>domain.projects());if(error)return <ResourceError message={error} retry={reload}/>;if(!data)return <Skeleton className="h-56 w-full"/>;if(data.items.length===0)return <EmptyPanel icon={FolderOpen} title="Your next track starts here" description="Create a project to collect your songs, explore versions, and keep the whole story of your sound together." href="/projects" action="Create your first project"/>;return <div className="grid gap-4">{data.items.slice(0,5).map(project=><Card key={project.id}><CardHeader><CardTitle><Link className="break-words hover:underline" href={`/projects/${project.id}`}>{project.name}</Link></CardTitle><CardDescription className="line-clamp-2">{project.description||"Ready for your next idea."}</CardDescription></CardHeader></Card>)}</div>;}
