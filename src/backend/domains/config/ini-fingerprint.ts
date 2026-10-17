import { createHash } from "node:crypto";
import type { IniFileFingerprints, ServerIniPayload } from "@shared/types";

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
