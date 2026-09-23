import { LayoutDashboard, FolderOpen, Sparkles, AudioLines, Columns3, ListMusic, Gauge, SlidersHorizontal, Disc3, Library, Settings2 } from "lucide-react";
export const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "Workspace" },
  { href: "/projects", label: "Projects", icon: FolderOpen, group: "Workspace" },
  { href: "/producer", label: "AI Producer", icon: Sparkles, group: "Create" },
  { href: "/generation", label: "Generation", icon: AudioLines, group: "Create" },
  { href: "/compare", label: "Listen & Compare", icon: Columns3, group: "Create" },
  { href: "/arrangement", label: "Arrangement", icon: ListMusic, group: "Shape" },
  { href: "/tempo", label: "Tempo / Remix", icon: Gauge, group: "Shape" },
  { href: "/stems", label: "Stems & Mixing", icon: SlidersHorizontal, group: "Shape" },
  { href: "/mastering", label: "Mastering", icon: Disc3, group: "Finish" },
  { href: "/library", label: "Library", icon: Library, group: "Finish" },
  { href: "/settings", label: "Settings", icon: Settings2, group: "Workspace settings" },
];
