import { applyIniSemanticOps, buildIniSemanticOps, type IniSemanticOp } from "@shared/ini/ini-semantic-ops";
import { isNamedEngramEntriesKey } from "@shared/ini/engram-named-entries";
import { isPlayerLevelEngramPointsKey } from "@shared/ini/player-level-engram-points";
import { isSupplyCrateEntriesKey } from "@shared/ini/supply-crate-entries";
import type { IniFileKey, ServerIniPayload } from "@shared/types";

/** The open INI view. Save writes that file or section and leaves the others in the draft. */
export type IniSaveScope =
  "gameUserSettings" | "gameSettings" | "engramPoints" | "engramOverrides" | "loot" | "gameText";

export function iniSaveScope(
  iniFile: IniFileKey,
  iniMode: "visual" | "text",
  gameView: "settings" | "engrams" | "loot",
  engramPane: "overrides" | "points",
): IniSaveScope {
  if (iniFile === "gameUserSettings") return "gameUserSettings";
  if (iniMode === "text") return "gameText";
  if (gameView === "settings") return "gameSettings";
  if (gameView === "loot") return "loot";
  return engramPane === "points" ? "engramPoints" : "engramOverrides";
}

function isGamePointsOp(op: IniSemanticOp): boolean {
  return op.fileKey === "game" && isPlayerLevelEngramPointsKey(op.key);
}

function isVisualEditorLineOp(op: IniSemanticOp): boolean {
  return op.fileKey === "game" && (isNamedEngramEntriesKey(op.key) || isSupplyCrateEntriesKey(op.key));
}

/** Semantic Set/Unset rows that belong to this view. Named engram and loot lines are not semantic ops. */
export function semanticOpInScope(op: IniSemanticOp, scope: IniSaveScope): boolean {
  if (isVisualEditorLineOp(op)) return false;
  if (scope === "gameUserSettings") return op.fileKey === "gameUserSettings";
  if (scope === "engramPoints") return isGamePointsOp(op);
  if (scope === "gameSettings") return op.fileKey === "game" && !isGamePointsOp(op);
  return false;
}

/** Which visual sections differ from the last save. Named engram drafts are separate. */
export function iniSectionPending(
  baseline: ServerIniPayload | null,
  draft: ServerIniPayload | null,
): { gameUserSettings: boolean; gameSettings: boolean; engramPoints: boolean } {
  if (baseline === null || draft === null) {
    return { gameUserSettings: false, gameSettings: false, engramPoints: false };
  }
  let gameUserSettings = false;
  let gameSettings = false;
  let engramPoints = false;
  for (const op of buildIniSemanticOps(baseline, draft)) {
    if (op.fileKey === "gameUserSettings") gameUserSettings = true;
    else if (isGamePointsOp(op)) engramPoints = true;
    else if (op.fileKey === "game" && !isVisualEditorLineOp(op)) gameSettings = true;
  }
  return { gameUserSettings, gameSettings, engramPoints };
}

export function iniViewDirty(
  scope: IniSaveScope,
  baseline: ServerIniPayload | null,
  draft: ServerIniPayload | null,
  engramEditCount: number,
  lootEditCount = 0,
): boolean {
  if (baseline === null || draft === null) return false;
  if (scope === "engramOverrides") return engramEditCount > 0;
  if (scope === "loot") return lootEditCount > 0;
  if (scope === "gameUserSettings") return draft.gameUserSettings !== baseline.gameUserSettings;
  if (scope === "gameText") return draft.game !== baseline.game;
  return buildIniSemanticOps(baseline, draft).some((op) => semanticOpInScope(op, scope));
}

/** Text Save writes the open file and sends the other file as last saved. */
export function textPayloadForScope(
  draft: ServerIniPayload,
  baseline: ServerIniPayload,
  scope: IniSaveScope,
): ServerIniPayload {
  if (scope === "gameUserSettings") return { gameUserSettings: draft.gameUserSettings, game: baseline.game };
  if (scope === "gameText") return { gameUserSettings: baseline.gameUserSettings, game: draft.game };
  return draft;
}

/**
 * Put unsaved visual edits from the other views back on top of the saved files.
 * Named engram / supply-crate keys on Overrides or Loot Save are written via
 * lineEdits — do not replay stale Set/Unset for those keys or Save can conflict
 * after a successful write, or leave the draft missing live lines still on disk.
 */
export function restoreUnsavedVisualEdits(
  saved: ServerIniPayload,
  baseline: ServerIniPayload,
  draft: ServerIniPayload,
  scope: IniSaveScope,
): ServerIniPayload {
  const kept = buildIniSemanticOps(baseline, draft).filter((op) => {
    if (semanticOpInScope(op, scope)) return false;
    if (scope === "engramOverrides" && isNamedEngramEntriesKey(op.key) && op.fileKey === "game") {
      return false;
    }
    if (scope === "loot" && isSupplyCrateEntriesKey(op.key) && op.fileKey === "game") {
      return false;
    }
    return true;
  });
  return applyIniSemanticOps(saved, kept);
}

/** Keep the file the text Save did not write. */
export function restoreUnsavedTextFile(
  saved: ServerIniPayload,
  draft: ServerIniPayload,
  scope: IniSaveScope,
): ServerIniPayload {
  if (scope === "gameUserSettings") return { ...saved, game: draft.game };
  if (scope === "gameText") return { ...saved, gameUserSettings: draft.gameUserSettings };
  return saved;
}
