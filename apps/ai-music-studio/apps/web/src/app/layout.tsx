import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Hungree Goat · AI Music Studio", description: "Your independent music production workspace." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

