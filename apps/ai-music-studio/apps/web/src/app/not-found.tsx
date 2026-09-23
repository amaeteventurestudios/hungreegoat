import { Compass } from "lucide-react";
import { PageHeading, EmptyPanel } from "@/components/page-primitives";
export default function NotFound() { return <><PageHeading title="Page not found" description="This part of the studio doesn’t exist." /><EmptyPanel icon={Compass} title="Find your way back" description="Your workspace is a click away." href="/" action="Back to dashboard" /></>; }
