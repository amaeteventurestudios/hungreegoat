import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/hooks/use-session";
import { AuthGate } from "@/components/auth-gate";
export const metadata: Metadata = { title: "Hungree Goat · AI Music Studio", description: "Your independent music production workspace." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SessionProvider><AuthGate>{children}</AuthGate></SessionProvider></body></html>;
}

