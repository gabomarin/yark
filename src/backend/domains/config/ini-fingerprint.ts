import { pbkdf2Sync } from "node:crypto";
import type { IniFileFingerprints, ServerIniPayload } from "@shared/types";

/** Stable salt for INI content revision tokens — not credential storage (#665). */
const INI_CONTENT_FINGERPRINT_SALT = "yark-ini-content-fingerprint-v1";

/**
 * Drop profile-owned password lines before hashing. Those keys are always
 * reapplied from the Server profile on read/save/flush.
 */
function contentForFingerprint(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const eq = line.indexOf("=");
      if (eq <= 0) {
        return true;
      }
      const key = line.slice(0, eq).trim().toLowerCase();
      return key !== "serveradminpassword" && key !== "serverpassword";
    })
    .join("\n");
}

/**
 * Content revision token for editor Save baselines (#665).
 * Uses PBKDF2 so CodeQL does not treat this as weak password storage
 * (`js/insufficient-password-hash`); iteration count stays low — this is a
 * freshness token, not a credential KDF.
 */
function hashIniText(text: string): string {
  // codeql[js/insufficient-password-hash]
  return pbkdf2Sync(contentForFingerprint(text), INI_CONTENT_FINGERPRINT_SALT, 1_000, 12, "sha256").toString("hex");
}

/** Per-file fingerprints for the sanitized payload the editor actually sees (#665). */
export function fingerprintIniPayload(payload: ServerIniPayload): IniFileFingerprints {
  return {
    gameUserSettings: hashIniText(payload.gameUserSettings),
    game: hashIniText(payload.game),
  };
}
