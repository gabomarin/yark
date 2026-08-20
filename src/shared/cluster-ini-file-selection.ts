/**
 * Which INI files a cluster template Promote / Restore / Seed includes (#181).
 * Default both = legacy full-pair behavior from #89.
 */

import type { ClusterIniTemplateFileSelection, ServerIniPayload } from "./types";

const DEFAULT_CLUSTER_INI_FILE_SELECTION: ClusterIniTemplateFileSelection =
  {
    gameUserSettings: true,
    game: true,
  };

/** Clone of the default both-files selection for UI / IPC defaults. */
export function defaultClusterIniFileSelection(): ClusterIniTemplateFileSelection {
  return { ...DEFAULT_CLUSTER_INI_FILE_SELECTION };
}

export function clusterIniFileSelectionHasWork(
  files: ClusterIniTemplateFileSelection,
): boolean {
  return files.gameUserSettings || files.game;
}

function requireBooleanField(
  record: Record<string, unknown>,
  key: keyof ClusterIniTemplateFileSelection,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`INI file selection.${key} must be a boolean`);
  }
  return value;
}

/**
 * Normalize IPC/UI payloads. Omitting the arg (or null/undefined) means both files.
 * Rejects empty selections and non-boolean field values.
 */
export function assertClusterIniTemplateFileSelection(
  raw?: unknown,
): ClusterIniTemplateFileSelection {
  if (raw === undefined || raw === null) {
    return defaultClusterIniFileSelection();
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("INI file selection must be an object");
  }
  const record = raw as Record<string, unknown>;
  const files: ClusterIniTemplateFileSelection = {
    gameUserSettings: requireBooleanField(record, "gameUserSettings"),
    game: requireBooleanField(record, "game"),
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
