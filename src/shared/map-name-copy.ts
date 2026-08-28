/**
 * Operator-facing Map Name copy.
 * Code, variables, and engineering docs may still say launch token / map token.
 */
export const MAP_NAME_COPY = {
  label: "Map Name",
  customLabel: "Custom Map Name",
  copyButton: "Copy Map Name",
  copyFailure: "Could not copy Map Name",
  mustNotContainSpaces: "Map Name must not contain spaces",
  mustBeSafeFolder: "Map Name must be a single safe folder name",
  tooLong: "Map Name is too long",
  mapNameFormatHint:
    "Launch map name for the dedicated server — usually ends in _WP (e.g. Svartalfheim_WP), no spaces.",
  confirmInferredHint:
    "YARK read this from CurseForge — confirm with the mod page or map community before you apply.",
  customUsuallyEndsWp:
    "Map name usually ends with _WP (e.g. Svartalfheim_WP). Check CurseForge, the map's Discord or wiki, or the author's notes if you're unsure.",
  searchMapsCreateHint:
    "Official ASA maps, or Search Maps… to find a mod map.",
  saveFolderDiffers:
    "Leave blank unless your save folder uses a different name than the map (e.g. Svartalfheim vs Svartalfheim_WP). Wrong names break world backups.",
  notInferredTitle: "Map name not found",
  notInferredBody:
    "CurseForge did not list a map name. Check the mod page, the map's Discord or wiki, or the author's install notes — it usually ends in _WP.",
  confirmTitle: "Confirm the map name",
  confirmBareWp:
    "No clear map name on CurseForge — confirm the *_WP value with the map author or community before you continue.",
  inferred: "Map name from CurseForge",
  possible: "Possible map name",
  notInferredFromCf:
    "YARK could not read a map name from CurseForge. Check the mod page, the map's Discord or wiki, or the author's notes before you apply this map.",
  verifyOnCurseForge:
    "Confirm with the CurseForge mod page or the map community before you apply.",
  setUnderCustom:
    "When you want this map, open Map and use Search Maps… or type the name under Custom. Your server keeps its current map until you switch.",
  createNeedsSearchMaps:
    "Mod maps are not listed here yet — use Search Maps… to find the mod.",
  worldBackupUnresolved: "World backup map name could not be resolved",
  requiredFromCurseForge:
    "Required — usually ends in _WP. Check CurseForge first; if it is not listed, ask the map community or check the author's notes.",
  applyConfirmIntro:
    "Sets the map name and adds this map mod to Mods (enabled) for this server.",
  applyConfirmNeedsMapName:
    "Enter the map name before you can use this map.",
  mapPackAlertTitle: "Map mod",
  /** Empty Mod Maps section in the Map popover (#460). */
  modMapsEmptyPopover:
    "No map mods on Mods yet. Use Search Maps…, or add the mod on the Mods tab first.",
  /** Custom… — when inference from mod metadata failed. */
  customWhenNotInferredHint:
    "Use when YARK could not read the map name from the mod description — find the correct name in the map's Discord, wiki, or author notes.",
  chooseWhenReady:
    "When you want this map, pick it from Map — Mod Maps or Search Maps…. Your server keeps its current map until then.",
} as const;
