import type { Metadata } from "next";
import "./globals.css";
import { StudioShell } from "@/components/studio-shell";
export const metadata: Metadata = { title: "Hungree Goat · AI Music Studio", description: "Your independent music production workspace." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><StudioShell>{children}</StudioShell></body></html>;
}

