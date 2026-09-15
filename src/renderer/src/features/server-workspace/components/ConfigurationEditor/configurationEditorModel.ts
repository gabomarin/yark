import type { ServerIniPayload } from "@shared/types";

/** localStorage: operator dismissed the GameUserSettings Server-tab override hint. */
export const INI_GUS_OVERRIDE_HINT_STORAGE_KEY =
  "yark.ini.gusOverrideHint.dismissed.v1";

export function iniPayloadsDirty(
  payload: ServerIniPayload | null,
  baseline: ServerIniPayload | null,
): boolean {
  return (
    payload !== null &&
    baseline !== null &&
    (payload.game !== baseline.game ||
      payload.gameUserSettings !== baseline.gameUserSettings)
  );
}
