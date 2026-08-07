export type RoadmapTag = "building" | "planned";

export type RoadmapItem = {
  tag: RoadmapTag;
  text: string;
};

/**
 * User-facing roadmap for the marketing site.
 * Sourced from open GitHub issues after v0.7.0.
 * Not a ship promise — keep wording directional.
 *
 * Later polish (keep on the radar; not listed as ship promises yet):
 * deeper Create-server / installation-health screenshots, FAQ for enable+health,
 * and refreshing the Clusters PNG when capture scripts run again.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    tag: "planned",
    text: "Signed Windows releases with a verifiable publisher and trusted timestamp",
  },
  {
    tag: "planned",
    text: "Reliable Windows E2E gates plus prepared-host validation against a real ASA server",
  },
  {
    tag: "planned",
    text: "Richer restore-audit history in the Backups UI",
  },
  {
    tag: "planned",
    text: "A sanitized support bundle for sharing diagnostics without credentials or world data",
  },
  {
    tag: "planned",
    text: "Measured abuse controls, caching, and operational alerts for the CurseForge metadata proxy",
  },
  {
    tag: "planned",
    text: "Full install-folder clone when duplicating a server profile",
  },
  {
    tag: "planned",
    text: "Structured launch options with a live command preview",
  },
];
