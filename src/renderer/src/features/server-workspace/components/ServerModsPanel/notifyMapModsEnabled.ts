import { notifications } from "@mantine/notifications";
import { isMapModCandidate, suggestMapTokenFromMetadata } from "@shared/asa/map-token-suggest";
import { MAP_NAME_COPY } from "@shared/asa/map-name-copy";
import type { ModMetadata } from "@shared/types";

/**
 * One aggregated toast when a bulk enable turned on one or more Maps/PC-only
 * mods — avoids a toast per row (same rule as bulk actions #635).
 */
export function notifyMapModsEnabled(modIds: readonly string[], cache: Record<string, ModMetadata>): void {
  const mapMods = modIds
    .map((id) => cache[id])
    .filter((meta): meta is ModMetadata => meta !== undefined && isMapModCandidate(meta));
  if (mapMods.length === 0) return;
  const allHaveToken = mapMods.every((meta) => suggestMapTokenFromMetadata(meta) !== null);
  notifications.show({
    color: "blue",
    title: mapMods.length === 1 ? "Map mod available" : `${mapMods.length} map mods available`,
    message: allHaveToken ? MAP_NAME_COPY.chooseWhenReady : MAP_NAME_COPY.setUnderCustom,
  });
}
