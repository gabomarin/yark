export type RoadmapTag = "building" | "planned";

export type RoadmapItem = {
  tag: RoadmapTag;
  text: string;
};

/**
 * User-facing roadmap for the marketing site.
 * Sourced from open GitHub issues after v0.9.0 (1.0 readiness first).
 * Not a ship promise — keep wording directional.
 *
 * Later polish (keep on the radar; not listed as ship promises yet):
 * deeper Create-server / installation-health screenshots, FAQ for enable+health,
 * richer restore-audit history, sanitized support bundle, full install-folder clone,
 * and 1.1 assistant / product expansion.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    tag: "planned",
    text: "Signed Windows releases with a verifiable publisher and trusted timestamp",
  },
  {
    tag: "planned",
    text: "Electron fuses and asar integrity checks on packaged Windows builds",
  },
  {
    tag: "planned",
    text: "Reliable Windows E2E gates plus prepared-host validation against a real ASA server",
  },
  {
    tag: "planned",
    text: "Import an existing ASA install as a YARK profile (discover mods, leave them disabled)",
  },
  {
    tag: "planned",
    text: "Automatic profile-database snapshots before schema migrations and on healthy boot",
  },
  {
    tag: "planned",
    text: "Validate real ASA cluster transfers across two managed servers",
  },
];
