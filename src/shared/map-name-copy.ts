/**
 * Operator-facing Map Name copy (matches CurseForge author pages).
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
  usuallyEndsWp:
    "Usually ends in _WP (example: Svartalfheim_WP). Same label as on the CurseForge page.",
  customUsuallyEndsWp:
    "Custom Map Name usually ends with _WP (example: Svartalfheim_WP).",
  searchMapsCreateHint:
    "Official maps, or Search Maps… to link a CurseForge pack and Map Name.",
  saveFolderDiffers:
    "Usually leave this blank. Only needed when the save folder name differs from the Map Name (e.g. Svartalfheim vs Svartalfheim_WP). If YARK can't find the folder, world backups will fail.",
  notInferredTitle: "Map Name not inferred",
  notInferredBody:
    "No Map Name in the description. Enter it from the author page (usually ends in _WP).",
  confirmTitle: "Confirm Map Name",
  confirmBareWp:
    "No labeled Map Name found. Confirm the *_WP value from the author page before applying.",
  inferred: "Inferred Map Name",
  possible: "Possible Map Name",
  notInferredFromCf:
    "YARK could not infer Map Name from the description. Copy it from CurseForge on the next step.",
  verifyOnCurseForge: "Verify on CurseForge before applying.",
  setUnderCustom:
    "Set the Map Name under Server Information → Map → Custom… when you want to use it. Your current map is unchanged.",
  createNeedsSearchMaps:
    "Custom maps on create need Search Maps… to link a CurseForge pack and Map Name.",
  worldBackupUnresolved: "World backup Map Name could not be resolved",
  requiredFromCurseForge:
    "Required. Copy Map Name from CurseForge (e.g. FjordurReloaded_WP).",
  applyConfirmIntro:
    "Writes Map Name, links mapModId, and enables that Project ID on Mods.",
  mapPackAlertTitle: "Map pack",
  chooseWhenReady:
    "Choose it under Server Information → Map (Map mods) when you want to use it. Your current map is unchanged.",
} as const;
