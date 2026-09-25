import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ModMetadata, ServerProfile } from "@shared/types";
import { mergeMetadata } from "./serverModsModel";
import { createServerModsListMutations } from "./serverModsListMutations";
import { useMapModEnableNotify } from "./useMapModEnableNotify";

interface Input {
  serverRef: MutableRefObject<ServerProfile>;
  configuredIdsRef: MutableRefObject<string[]>;
  disabledIdsRef: MutableRefObject<string[]>;
  passiveIdsRef: MutableRefObject<string[]>;
  cacheRef: MutableRefObject<Record<string, ModMetadata>>;
  metadata: Map<string, ModMetadata>;
  onServerUpdated: () => void;
  setConfiguredIds: Dispatch<SetStateAction<string[]>>;
  setDisabledIds: Dispatch<SetStateAction<string[]>>;
  setPassiveIds: Dispatch<SetStateAction<string[]>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setWarning: Dispatch<SetStateAction<string | null>>;
  setMetadata: Dispatch<SetStateAction<Map<string, ModMetadata>>>;
}

/**
 * Persist + list mutations for the Mods panel (#209 / #509). Keeps the panel a
 * composition shell; the four mod lists (configured/disabled/passive/cache) are
 * written in one patch and passiveIds defaults to the latest ref so the shorter
 * call sites never have to thread it.
 */
export function useServerModsListController(input: Input) {
  const persistQueueRef = useRef<Promise<void> | null>(null);
  const persist = (
    nextIds: string[],
    nextDisabled: string[],
    nextCache: Record<string, ModMetadata>,
    nextPassive: string[] = input.passiveIdsRef.current,
  ): Promise<void> => {
    // Snapshot the server id so a workspace switch mid-await does not apply this write.
    const targetServerId = input.serverRef.current.id;
    const write = (persistQueueRef.current ?? Promise.resolve()).then(async () => {
      const result = await window.api.updateServerPatch(targetServerId, {
        group: "mods",
        mods: nextIds,
        disabledMods: nextDisabled,
        passiveMods: nextPassive,
        modMetadataCache: nextCache,
      });
      if (!result.ok) throw new Error(result.error);
      if (input.serverRef.current.id !== targetServerId) return;
      input.configuredIdsRef.current = nextIds;
      input.disabledIdsRef.current = nextDisabled;
      input.passiveIdsRef.current = nextPassive;
      input.setConfiguredIds(nextIds);
      input.setDisabledIds(nextDisabled);
      input.setPassiveIds(nextPassive);
      input.cacheRef.current = nextCache;
      input.setMetadata((previous) => mergeMetadata(previous, nextCache));
      input.onServerUpdated();
    });
    persistQueueRef.current = write.then(
      () => undefined,
      () => undefined,
    );
    return write;
  };

  const { notifyMapModIfNeeded } = useMapModEnableNotify({
    configuredIdsRef: input.configuredIdsRef,
    disabledIdsRef: input.disabledIdsRef,
    cacheRef: input.cacheRef,
    persist,
  });

  const mutations = createServerModsListMutations({
    configuredIdsRef: input.configuredIdsRef,
    disabledIdsRef: input.disabledIdsRef,
    passiveIdsRef: input.passiveIdsRef,
    metadata: input.metadata,
    cacheRef: input.cacheRef,
    setBusyKey: input.setBusyKey,
    setDisabledIds: input.setDisabledIds,
    setPassiveIds: input.setPassiveIds,
    setError: input.setError,
    setWarning: input.setWarning,
    persist,
    notifyMapModIfNeeded,
  });

  return { persist, ...mutations };
}
