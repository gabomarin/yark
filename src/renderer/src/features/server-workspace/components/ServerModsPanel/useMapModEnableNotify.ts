import type { MutableRefObject } from "react";
import { notifications } from "@mantine/notifications";
import {
  isMapModCandidate,
  suggestMapTokenFromMetadata,
} from "@shared/map-token-suggest";
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
  configuredIds: string[];
  disabledIds: string[];
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
          await options.persist(
            options.configuredIds.includes(modId)
              ? options.configuredIds
              : [...options.configuredIds, modId],
            options.disabledIds.filter((id) => id !== modId),
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

    notifications.show({
      color: "blue",
      title: "Map mod available",
      message:
        "Choose it under Server Information → Map when you want to use it. Your current map is unchanged.",
    });
  };

  return { notifyMapModIfNeeded };
}
