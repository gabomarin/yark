import { createHash } from "node:crypto";
import type { IniFileFingerprints, ServerIniPayload } from "../types";

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

function hashIniText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 24);
}

/** Per-file fingerprints for the sanitized payload the editor actually sees (#665). */
export function fingerprintIniPayload(payload: ServerIniPayload): IniFileFingerprints {
  return {
    gameUserSettings: hashIniText(payload.gameUserSettings),
    game: hashIniText(payload.game),
  };
}

export function iniFingerprintsMatch(a: IniFileFingerprints, b: IniFileFingerprints): boolean {
  return a.gameUserSettings === b.gameUserSettings && a.game === b.game;
}
