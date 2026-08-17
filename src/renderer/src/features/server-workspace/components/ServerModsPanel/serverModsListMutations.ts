import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ModMetadata } from "@shared/types";
import { notifyModsAddedDisabled } from "./notifyModsAddedDisabled";
import { MODS_REORDER_BUSY_KEY } from "./serverModsBusy";

interface Input {
  configuredIdsRef: MutableRefObject<string[]>;
  disabledIdsRef: MutableRefObject<string[]>;
  metadata: Map<string, ModMetadata>;
  cacheRef: MutableRefObject<Record<string, ModMetadata>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setWarning: Dispatch<SetStateAction<string | null>>;
  persist: (
    nextIds: string[],
    nextDisabled: string[],
    nextCache: Record<string, ModMetadata>,
  ) => Promise<void>;
  notifyMapModIfNeeded: (
    id: string,
    meta: ModMetadata | undefined,
  ) => Promise<void>;
}

export function createServerModsListMutations(input: Input) {
  const add = async (modDetail: ModMetadata) => {
    const configuredIds = input.configuredIdsRef.current;
    const disabledIds = input.disabledIdsRef.current;
    const isNew = !configuredIds.includes(modDetail.id);
    const nextIds = isNew ? [...configuredIds, modDetail.id] : configuredIds;
    const nextDisabled = isNew
      ? [...new Set([...disabledIds, modDetail.id])]
      : disabledIds;
    const nextCache = { ...input.cacheRef.current, [modDetail.id]: modDetail };
    await input.persist(nextIds, nextDisabled, nextCache);
    if (isNew) {
      notifyModsAddedDisabled({ name: modDetail.name });
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    input.setBusyKey(id);
    input.setError(null);
    input.setWarning(null);
    const configuredIds = input.configuredIdsRef.current;
    const disabledIds = input.disabledIdsRef.current;
    const nextDisabled = enabled
      ? disabledIds.filter((candidate) => candidate !== id)
      : [...new Set([...disabledIds, id])];
    try {
      await input.persist(configuredIds, nextDisabled, input.cacheRef.current);
      if (enabled) {
        const meta = input.cacheRef.current[id] ?? input.metadata.get(id);
        await input.notifyMapModIfNeeded(id, meta);
      }
    } catch (cause) {
      input.setError(
        cause instanceof Error ? cause.message : "Could not update the mod",
      );
    } finally {
      input.setBusyKey(null);
    }
  };

  const remove = async (id: string) => {
    input.setBusyKey(id);
    input.setError(null);
    input.setWarning(null);
    const configuredIds = input.configuredIdsRef.current;
    const disabledIds = input.disabledIdsRef.current;
    const nextCache = { ...input.cacheRef.current };
    delete nextCache[id];
    try {
      await input.persist(
        configuredIds.filter((candidate) => candidate !== id),
        disabledIds.filter((candidate) => candidate !== id),
        nextCache,
      );
    } catch (cause) {
      input.setError(
        cause instanceof Error ? cause.message : "Could not remove the mod",
      );
    } finally {
      input.setBusyKey(null);
    }
  };

  const reorder = async (orderedIds: string[]) => {
    const configuredIds = input.configuredIdsRef.current;
    const disabledIds = input.disabledIdsRef.current;
    if (
      orderedIds.length !== configuredIds.length
      || orderedIds.some((id) => !configuredIds.includes(id))
    ) {
      return;
    }
    if (orderedIds.every((id, index) => id === configuredIds[index])) {
      return;
    }
    input.setBusyKey(MODS_REORDER_BUSY_KEY);
    input.setError(null);
    input.setWarning(null);
    try {
      await input.persist(orderedIds, disabledIds, input.cacheRef.current);
    } catch (cause) {
      input.setError(
        cause instanceof Error ? cause.message : "Could not reorder mods",
      );
    } finally {
      input.setBusyKey(null);
    }
  };

  return { add, toggle, remove, reorder };
}
