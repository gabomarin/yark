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
  setDisabledIds: Dispatch<SetStateAction<string[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setWarning: Dispatch<SetStateAction<string | null>>;
  persist: (nextIds: string[], nextDisabled: string[], nextCache: Record<string, ModMetadata>) => Promise<void>;
  notifyMapModIfNeeded: (id: string, meta: ModMetadata | undefined) => Promise<void>;
}

/**
 * Set equality, not membership of a list: duplicate entries must not make two different lists
 * compare equal (`["x","x"]` vs `["x","y"]` passes a multiset check), and `includes` inside a
 * loop rescans the list. Order-insensitive, which is what the rollback needs - array identity
 * was too strict (any copy would silently stop the revert) and a naive scan too loose.
 */
function sameDisabledIds(a: readonly string[], b: readonly string[]): boolean {
  const aSet = new Set(a);
  if (aSet.size !== a.length) {
    return false;
  }
  const bSet = new Set(b);
  return aSet.size === bSet.size && a.every((id) => bSet.has(id));
}

export function createServerModsListMutations(input: Input) {
  const add = async (modDetail: ModMetadata) => {
    input.setBusyKey(modDetail.id);
    input.setError(null);
    input.setWarning(null);
    const configuredIds = input.configuredIdsRef.current;
    const disabledIds = input.disabledIdsRef.current;
    const isNew = !configuredIds.includes(modDetail.id);
    const nextIds = isNew ? [...configuredIds, modDetail.id] : configuredIds;
    const nextDisabled = isNew ? [...new Set([...disabledIds, modDetail.id])] : disabledIds;
    const nextCache = { ...input.cacheRef.current, [modDetail.id]: modDetail };
    try {
      await input.persist(nextIds, nextDisabled, nextCache);
      if (isNew) {
        notifyModsAddedDisabled({ name: modDetail.name });
      }
    } catch (cause) {
      input.setError(cause instanceof Error ? cause.message : "Could not add the mod");
    } finally {
      input.setBusyKey(null);
    }
  };

  /**
   * Optimistic on purpose. The row's own switch is the control in flight, so it has to show
   * the new state at once: marking the row busy for the length of the write disabled every
   * action icon in it (a visible flash) and froze the knob at the old value until the write
   * landed, which read as a switch with no animation. The refs move with the state so a
   * second click computes from the optimistic value, and a failed write puts both back.
   */
  const toggle = async (id: string, enabled: boolean) => {
    input.setError(null);
    input.setWarning(null);
    const configuredIds = input.configuredIdsRef.current;
    const previousDisabled = input.disabledIdsRef.current;
    const nextDisabled = enabled
      ? previousDisabled.filter((candidate) => candidate !== id)
      : [...new Set([...previousDisabled, id])];
    input.disabledIdsRef.current = nextDisabled;
    input.setDisabledIds(nextDisabled);
    let persisted = false;
    try {
      await input.persist(configuredIds, nextDisabled, input.cacheRef.current);
      persisted = true;
      if (enabled) {
        const meta = input.cacheRef.current[id] ?? input.metadata.get(id);
        await input.notifyMapModIfNeeded(id, meta);
      }
    } catch (cause) {
      /*
       * Undo this call's own optimistic flip only: a write that landed must not be reverted
       * because the notification after it threw, and a late failure must not clobber the
       * value a newer toggle has already written.
       */
      if (!persisted && sameDisabledIds(input.disabledIdsRef.current, nextDisabled)) {
        input.disabledIdsRef.current = previousDisabled;
        input.setDisabledIds(previousDisabled);
      }
      input.setError(cause instanceof Error ? cause.message : "Could not update the mod");
    }
  };

  /** True when persist succeeded — lets the detail drawer close only after remove. */
  const remove = async (id: string): Promise<boolean> => {
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
      return true;
    } catch (cause) {
      input.setError(cause instanceof Error ? cause.message : "Could not remove the mod");
      return false;
    } finally {
      input.setBusyKey(null);
    }
  };

  const reorder = async (orderedIds: string[]) => {
    const configuredIds = input.configuredIdsRef.current;
    const disabledIds = input.disabledIdsRef.current;
    const configuredIdSet = new Set(configuredIds);
    if (orderedIds.length !== configuredIds.length || orderedIds.some((id) => !configuredIdSet.has(id))) {
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
      input.setError(cause instanceof Error ? cause.message : "Could not reorder mods");
    } finally {
      input.setBusyKey(null);
    }
  };

  return { add, toggle, remove, reorder };
}
