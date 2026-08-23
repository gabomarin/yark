import type { ServerIniPayload } from "@shared/types";

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
