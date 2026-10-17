import type { IniFileFingerprints } from "../types";

/** Stable IPC / UI code when Save loses a race with external INI edits (#665). */
export const INI_STALE_DOCUMENT_CODE = "INI_STALE_DOCUMENT" as const;

/**
 * Thrown when `ini:save` baselines do not match the current read payload.
 * `wrapIpcResult` surfaces `code` on `IpcResult` for UI branching.
 */
export class IniStaleDocumentError extends Error {
  readonly code = INI_STALE_DOCUMENT_CODE;

  constructor(message = "INI files changed outside YARK since this editor loaded. Reload before saving.") {
    super(message);
    this.name = "IniStaleDocumentError";
  }
}

export function iniFingerprintsMatch(a: IniFileFingerprints, b: IniFileFingerprints): boolean {
  return a.gameUserSettings === b.gameUserSettings && a.game === b.game;
}
