import { createHash } from "node:crypto";
import type { IniFileFingerprints, ServerIniPayload } from "@shared/types";

/**
 * Revision token for editor Save baselines (#665) — not credential storage.
 * Profile-owned password keys are reapplied on read/save/flush, so they are
 * omitted here (also avoids CodeQL js/insufficient-password-hash on INI text).
 */
function contentForFingerprint(text: string): string {
  return text.replace(/^(ServerAdminPassword|ServerPassword)=.*$/gim, "$1=");
}

function hashIniText(text: string): string {
  return createHash("sha256").update(contentForFingerprint(text), "utf8").digest("hex").slice(0, 24);
}

/** Per-file fingerprints for the sanitized payload the editor actually sees (#665). */
export function fingerprintIniPayload(payload: ServerIniPayload): IniFileFingerprints {
  return {
    gameUserSettings: hashIniText(payload.gameUserSettings),
    game: hashIniText(payload.game),
  };
}
