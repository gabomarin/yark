/**
 * Which INI files a cluster template Promote / Restore / Seed includes (#181).
 * Default both = legacy full-pair behavior from #89.
 */

import type { ClusterIniTemplateFileSelection, ServerIniPayload } from "./types";

export const DEFAULT_CLUSTER_INI_FILE_SELECTION: ClusterIniTemplateFileSelection =
  {
    gameUserSettings: true,
    game: true,
  };

export function emptyClusterIniFileSelection(): ClusterIniTemplateFileSelection {
  return { ...DEFAULT_CLUSTER_INI_FILE_SELECTION };
}

export function clusterIniFileSelectionHasWork(
  files: ClusterIniTemplateFileSelection,
): boolean {
  return files.gameUserSettings || files.game;
}

/**
 * Normalize IPC/UI payloads. Omitting the arg (or null/undefined) means both files.
 * Rejects empty selections.
 */
export function assertClusterIniTemplateFileSelection(
  raw?: unknown,
): ClusterIniTemplateFileSelection {
  if (raw === undefined || raw === null) {
    return emptyClusterIniFileSelection();
  }
  if (typeof raw !== "object") {
    throw new Error("INI file selection must be an object");
  }
  const record = raw as Record<string, unknown>;
  const files: ClusterIniTemplateFileSelection = {
    gameUserSettings: Boolean(record.gameUserSettings),
    game: Boolean(record.game),
  };
  if (!clusterIniFileSelectionHasWork(files)) {
    throw new Error("Select at least one INI file (Game.ini or GameUserSettings.ini)");
  }
  return files;
}

/** Keep baseline text for files the operator did not select. */
export function mergeClusterIniPayloadByFileSelection(
  composed: ServerIniPayload,
  baseline: ServerIniPayload,
  files: ClusterIniTemplateFileSelection,
): ServerIniPayload {
  return {
    gameUserSettings: files.gameUserSettings
      ? composed.gameUserSettings
      : baseline.gameUserSettings,
    game: files.game ? composed.game : baseline.game,
  };
}
