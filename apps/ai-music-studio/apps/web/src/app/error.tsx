"use client";
import { useEffect } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@hungreegoat/studio-ui/components/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@hungreegoat/studio-ui/components/card";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
 useEffect(() => { console.error("studio_page_error", { digest: error.digest, name: error.name }); }, [error]);
 return <Card role="alert"><CardHeader><CircleAlert className="mb-3 text-destructive" /><CardTitle>Something interrupted your workspace</CardTitle><CardDescription>We couldn’t load this page. Try again to reconnect.</CardDescription></CardHeader><CardContent><Button onClick={reset}>Try again</Button></CardContent></Card>;
}
