import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ModMetadata } from "@shared/types";
import { MODS_REORDER_BUSY_KEY } from "./serverModsBusy";

interface Input {
  configuredIds: string[];
  disabledIds: string[];
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
  const toggle = async (id: string, enabled: boolean) => {
    input.setBusyKey(id);
    input.setError(null);
    input.setWarning(null);
    const nextDisabled = enabled
      ? input.disabledIds.filter((candidate) => candidate !== id)
      : [...new Set([...input.disabledIds, id])];
    try {
      await input.persist(input.configuredIds, nextDisabled, input.cacheRef.current);
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
    const nextCache = { ...input.cacheRef.current };
    delete nextCache[id];
    try {
      await input.persist(
        input.configuredIds.filter((candidate) => candidate !== id),
        input.disabledIds.filter((candidate) => candidate !== id),
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
    if (
      orderedIds.length !== input.configuredIds.length
      || orderedIds.some((id) => !input.configuredIds.includes(id))
    ) {
      return;
    }
    if (orderedIds.every((id, index) => id === input.configuredIds[index])) {
      return;
    }
    input.setBusyKey(MODS_REORDER_BUSY_KEY);
    input.setError(null);
    input.setWarning(null);
    try {
      await input.persist(orderedIds, input.disabledIds, input.cacheRef.current);
    } catch (cause) {
      input.setError(
        cause instanceof Error ? cause.message : "Could not reorder mods",
      );
    } finally {
      input.setBusyKey(null);
    }
  };

  return { toggle, remove, reorder };
}
