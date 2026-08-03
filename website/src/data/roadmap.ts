export type RoadmapTag = "building" | "planned";

export type RoadmapItem = {
  tag: RoadmapTag;
  text: string;
};

/**
 * User-facing roadmap for the marketing site.
 * Sourced from the live release roadmap and open GitHub issues after v0.5.1.
 * Not a ship promise — keep wording directional.
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
    text: "Portable server and backup export / import with audited restore history",
  },
  {
    tag: "planned",
    text: "Retention and rotation controls for operational logs",
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
    text: "Per-server auto-start when you open the app",
  },
  {
    tag: "planned",
    text: "Full per-server RCON console with command history",
  },
  {
    tag: "planned",
    text: "Copy selected configuration between server profiles",
  },
  {
    tag: "planned",
    text: "Structured launch options with a live command preview",
  },
];
