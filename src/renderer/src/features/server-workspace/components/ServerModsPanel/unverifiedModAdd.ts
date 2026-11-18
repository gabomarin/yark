import type { ModAddApplyState } from "@shared/mods/mod-add-input";

/** Stage operator-confirmed Project IDs without metadata (#698). */
export function stageUnverifiedProjectIds(
  current: ModAddApplyState,
  ids: readonly string[],
): ModAddApplyState {
  let nextIds = [...current.configuredIds];
  const idSet = new Set(nextIds);
  let nextDisabled = [...current.disabledIds];
  for (const id of ids) {
    if (idSet.has(id)) continue;
    nextIds = [...nextIds, id];
    idSet.add(id);
    if (!nextDisabled.includes(id)) {
      nextDisabled = [...nextDisabled, id];
    }
  }
  return {
    configuredIds: nextIds,
    disabledIds: nextDisabled,
    // Intentionally unchanged — no metadata cache entry for unverified adds.
    cache: current.cache,
  };
}
