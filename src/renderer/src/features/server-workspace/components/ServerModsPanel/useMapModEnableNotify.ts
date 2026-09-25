import type { MutableRefObject } from "react";
import { notifications } from "@mantine/notifications";
import { isMapModCandidate, suggestMapTokenFromMetadata } from "@shared/asa/map-token-suggest";
import { MAP_NAME_COPY } from "@shared/asa/map-name-copy";
import type { ModMetadata } from "@shared/types";

interface PersistCacheFn {
  (nextIds: string[], nextDisabled: string[], nextCache: Record<string, ModMetadata>): Promise<void>;
}

/**
 * After a Maps mod is enabled: refresh metadata when the map name is unknown,
 * toast the operator to pick it under Server Information → Map. Never changes map (#192).
 */
export function useMapModEnableNotify(options: {
  configuredIdsRef: MutableRefObject<string[]>;
  disabledIdsRef: MutableRefObject<string[]>;
  cacheRef: MutableRefObject<Record<string, ModMetadata>>;
  persist: PersistCacheFn;
}): {
  notifyMapModIfNeeded: (modId: string, meta: ModMetadata | undefined) => Promise<void>;
} {
  const notifyMapModIfNeeded = async (modId: string, meta: ModMetadata | undefined) => {
    let detail = meta;
    if (detail === undefined || !isMapModCandidate(detail)) {
      return;
    }

    if (suggestMapTokenFromMetadata(detail) === null) {
      try {
        const result = await window.api.getModByReference(modId);
        if (result.ok && isMapModCandidate(result.data)) {
          detail = result.data;
          // Re-read lists after the await so a concurrent toggle is not reverted.
          // Only enrich cache; do not force-enable this mod if the operator disabled it.
          await options.persist(options.configuredIdsRef.current, options.disabledIdsRef.current, {
            ...options.cacheRef.current,
            [detail.id]: detail,
          });
        }
      } catch {
        // Still notify; Custom… remains available.
      }
    }

    const hasToken = suggestMapTokenFromMetadata(detail) !== null;
    notifications.show({
      color: "blue",
      title: "Map mod available",
      message: hasToken ? MAP_NAME_COPY.chooseWhenReady : MAP_NAME_COPY.setUnderCustom,
    });
  };

  return { notifyMapModIfNeeded };
}

/**
 * One aggregated toast when a bulk enable turned on one or more Maps/PC-only
 * mods — avoids a toast per row (same rule as bulk actions #635).
 */
export function notifyMapModsEnabled(modIds: string[], cache: Record<string, ModMetadata>): void {
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
