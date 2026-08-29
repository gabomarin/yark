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
 * Shipped in v0.17.0 (removed from this list): RCON remote AdminListURL (#153),
 * create/clone next-free ports (#55), visual Map picker (#460), Search Maps… (#295),
 * Mods drawer screenshots/description (#342), workspace Backups/Logs polish (#231/#225).
 * Shipped in v0.16.0 (not previously listed here): Overview fleet metric strip
 * (#314), survivor counts (#301), dedicated-process RAM/CPU (#302), Overview
 * search persistence (#438), third-party notices / About link (#446).
 * Shipped in v0.15.0 (not previously listed here): Discover mods browse (#297),
 * desktop alerts / Windows toasts (#331), flat content panels (#346), quiet icon
 * actions (#397), destructive/filled lifecycle buttons (#344), Start/Restart
 * immediate feedback (#390), ScrollArea dual-scrollbar fix (#395).
 * Shipped in v0.14.0 (not previously listed here): Downloads queue page (#201),
 * Overview Update All (#378), server list sort/view (#351), Launch tab search (#352),
 * quieter operator chrome, packaged DevTools hardening.
 * Shipped on the Downloads queue branch (#201, not previously listed here): Steam-style
 * SteamCMD queue page, workspace footer teaser, Pause/Resume, Verify replace.
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
 * Local AdminListURL / hosted list files remain deferred (Hosted Resources / PHOST-001).
 */
export const roadmapItems: RoadmapItem[] = [
  {
    tag: "planned",
    text: "Local / hosted AdminListURL for ASA admin whitelist (beyond remote http(s))",
  },
  {
    tag: "planned",
    text: "Optional AI chat assistant (bring-your-own OpenAI-compatible key) for fleet help",
  },
];
