import { withBase } from "./site";

export type Screenshot = {
  src: string;
  alt: string;
  caption: string;
};

/** Basename without extension (`overview.png` → `overview`) for `/media/{slug}-*.webp`. */
export function screenshotSlug(shot: Screenshot): string {
  const file = shot.src.split("/").pop() ?? "";
  return file.replace(/\.png$/i, "");
}

export const screenshots: Screenshot[] = [
  {
    src: withBase("/screenshots/overview.png"),
    alt: "YARK Windows overview listing ARK Survival Ascended server profiles with map artwork, status, and recent activity",
    caption:
      "Servers overview — profiles with map artwork, status, and recent activity in one place.",
  },
  {
    src: withBase("/screenshots/downloads.png"),
    alt: "YARK Downloads queue with an active SteamCMD job, queued servers, and a paused install on Windows",
    caption:
      "Downloads — SteamCMD install, update, and verify jobs in one queue, with Pause/Resume and a live console.",
  },
  {
    src: withBase("/screenshots/setup-assistant.png"),
    alt: "YARK first-run setup assistant showing SteamCMD and the default server-folder controls",
    caption:
      "Setup assistant — configure shared paths and Windows behavior, then create or import the first server.",
  },
  {
    src: withBase("/screenshots/workspace-server.png"),
    alt: "ASA dedicated server configuration in YARK with identity, Max players, Move installation, networking, cluster, and Auto-start",
    caption:
      "Server configuration — identity, Move installation, ports, access, cluster, and Auto-start. Mods live on the Mods tab.",
  },
  {
    src: withBase("/screenshots/workspace-mods.png"),
    alt: "YARK Mods tab listing CurseForge Project IDs for an ASA dedicated server with enable toggles and metadata",
    caption:
      "Mods — flat panel with a dense load-order table, enable toggles, Project IDs, and Worker-backed metadata.",
  },
  {
    src: withBase("/screenshots/workspace-ini.png"),
    alt: "Visual INI editor in YARK showing GameUserSettings.ini options with toggles, values, and descriptions",
    caption:
      "Visual INI editor — edit GameUserSettings.ini with searchable, described controls.",
  },
  {
    src: withBase("/screenshots/workspace-backups.png"),
    alt: "Per-server Backups tab in YARK with destination, schedule, Import, and Backup actions for an ASA world",
    caption:
      "Server Backups — schedule world saves, browse join/leave player archives, and restore world / players / INI per profile.",
  },
  {
    src: withBase("/screenshots/configuration-wizard.png"),
    alt: "YARK configuration assistant with experience-profile cards and a six-step wizard",
    caption:
      "Configuration assistant — experience cards and a guided six-step wizard; nothing is written until the final review.",
  },
  {
    src: withBase("/screenshots/backups.png"),
    alt: "YARK backups dashboard with fleet health badges, disk usage, volumes, and per-server destinations on Windows",
    caption:
      "Backups — fleet health badges, disk usage, destinations, and alerts across servers.",
  },
  {
    src: withBase("/screenshots/clusters.png"),
    alt: "YARK Clusters page for ARK Ascended transfers with create/membership, INI templates, and Cluster ID compliance",
    caption:
      "Clusters — create and membership, INI templates, and Cluster ID / shared directory compliance.",
  },
  {
    src: withBase("/screenshots/logs.png"),
    alt: "YARK Logs page listing recent ASA server problems and activity with severity filters",
    caption:
      "Logs — problems and activity across servers, with drill-down into each server’s Logs tab.",
  },
  {
    src: withBase("/screenshots/settings.png"),
    alt: "YARK Settings on Windows with category navigation and the setup assistant entry point",
    caption:
      "Settings — app-wide preferences grouped by category, with the setup assistant available anytime.",
  },
];
