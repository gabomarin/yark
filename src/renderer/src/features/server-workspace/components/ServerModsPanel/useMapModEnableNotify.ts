import type { MutableRefObject } from "react";
import { notifications } from "@mantine/notifications";
import {
  isMapModCandidate,
  suggestMapTokenFromMetadata,
} from "@shared/map-token-suggest";
import { MAP_NAME_COPY } from "@shared/map-name-copy";
import type { ModMetadata } from "@shared/types";

interface PersistCacheFn {
  (
    nextIds: string[],
    nextDisabled: string[],
    nextCache: Record<string, ModMetadata>,
  ): Promise<void>;
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
  const notifyMapModIfNeeded = async (
    modId: string,
    meta: ModMetadata | undefined,
  ) => {
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
          await options.persist(
            options.configuredIdsRef.current,
            options.disabledIdsRef.current,
            {
              ...options.cacheRef.current,
              [detail.id]: detail,
            },
          );
        }
      } catch {
        // Still notify; Custom… remains available.
      }
    }

    const hasToken = suggestMapTokenFromMetadata(detail) !== null;
    notifications.show({
      color: "blue",
      title: "Map mod available",
      message: hasToken
        ? MAP_NAME_COPY.chooseWhenReady
        : MAP_NAME_COPY.setUnderCustom,
    });
  };

  return { notifyMapModIfNeeded };
}
