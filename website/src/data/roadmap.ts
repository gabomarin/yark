export type RoadmapTag = "building" | "planned";

export type RoadmapItem = {
  tag: RoadmapTag;
  text: string;
};

/**
 * User-facing roadmap for the marketing site.
 * Prefer operator-visible product work from open issues (not CI/packaging hygiene).
 * Not a ship promise — keep wording directional. Milestones on GitHub stay authoritative.
 *
 * Shipped in v0.13.1 (not previously listed here): sharper getyark.com screenshot WebP,
 * fossil sidebar YARK-update cue.
 * Shipped in v0.13.0 (not previously listed here): Max players, clone folder copy (#160),
 * first-run setup (#298), Mods drawer/chrome (#227/#238/#226), Configuration wizard (#230/#224),
 * Settings category sidebar, junction hardening (#322).
 * Shipped in v0.12.0 (not previously listed here): splash (#317), What's new (#290),
 * ServerForm / leave-guards, crash Runtime logs (#326), cluster live-transfer docs (#22).
 * Shipped in v0.11.0 (removed from this list): remove-from-YARK-only (#267).
 * Shipped in v0.10.0 (removed from this list): import existing install (#254),
 * profile-DB snapshots (#252), per-map world backups (#262), Electron fuses (#217).
 * Still omitted here (tracked in-repo): E2E/real-host validation (#12), Authenticode (#142),
 * incomplete-import opt-in (#283) is shipped with Import — not listed as future work.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    tag: "planned",
    text: "Steam-style SteamCMD download queue with a persistent workspace footer",
  },
  {
    tag: "planned",
    text: "Admin whitelist controls on the RCON Players panel",
  },
  {
    tag: "planned",
    text: "Smarter default ports and suggestions when creating a new server",
  },
  {
    tag: "planned",
    text: "Optional AI chat assistant (bring-your-own OpenAI-compatible key) for fleet help",
  },
];
