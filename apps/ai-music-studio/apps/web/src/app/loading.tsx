import { Skeleton } from "@hungreegoat/studio-ui/components/skeleton";
export default function Loading() {
 return <div role="status" aria-label="Loading Studio" className="space-y-6"><span className="sr-only">Loading Studio…</span><Skeleton className="h-10 w-2/3 max-w-sm" /><Skeleton className="h-5 w-full max-w-lg" /><div className="grid gap-5 md:grid-cols-3">{[1,2,3].map(key => <Skeleton key={key} className="min-h-40 rounded-xl" />)}</div></div>;
}
