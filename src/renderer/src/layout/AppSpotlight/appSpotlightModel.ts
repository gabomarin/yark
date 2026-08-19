import {
  FileText,
  GearSix,
  HardDrives,
  ShareNetwork,
  SquaresFour,
  DownloadSimple,
} from "@phosphor-icons/react";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { ServerProfile } from "@shared/types";

export interface SpotlightNavItem {
  id: Route;
  label: string;
  description: string;
  keywords: string[];
  /** Same Phosphor icons as the app Sidebar. */
  icon: typeof HardDrives;
}

/** Navigate entries for Spotlight (mirrors Sidebar labels/icons). */
export const SPOTLIGHT_NAV_ITEMS: SpotlightNavItem[] = [
  {
    id: "overview",
    label: "Servers",
    description: "Overview and server list",
    keywords: ["home", "overview", "fleet"],
    icon: SquaresFour,
  },
  {
    id: "downloads",
    label: "Downloads",
    description: "SteamCMD installs, updates, and file copies",
    keywords: ["download", "steamcmd", "update", "queue"],
    icon: DownloadSimple,
  },
  {
    id: "clusters",
    label: "Clusters",
    description: "Cluster membership and transfer",
    keywords: ["cluster", "transfer"],
    icon: ShareNetwork,
  },
  {
    id: "backups",
    label: "Backups",
    description: "Fleet backup health and cleanup",
    keywords: ["backup", "archive", "restore"],
    icon: HardDrives,
  },
  {
    id: "logs",
    label: "Logs",
    description: "Fleet activity and problems",
    keywords: ["log", "events", "activity"],
    icon: FileText,
  },
  {
    id: "settings",
    label: "Settings",
    description: "App preferences and SteamCMD",
    keywords: ["preferences", "options", "steamcmd"],
    icon: GearSix,
  },
];

/** Stable A→Z order for the Servers group. */
export function sortServersForSpotlight(
  servers: ServerProfile[],
): ServerProfile[] {
  return [...servers].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
