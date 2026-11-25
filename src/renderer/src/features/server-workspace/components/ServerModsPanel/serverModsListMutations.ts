import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ModMetadata } from "@shared/types";
import { notifyModsAddedDisabled } from "./notifyModsAddedDisabled";
import { notifyMapModsEnabled } from "./notifyMapModsEnabled";
import { MODS_BULK_BUSY_KEY, MODS_REORDER_BUSY_KEY } from "./serverModsBusy";

interface Input {
  configuredIdsRef: MutableRefObject<string[]>;
  disabledIdsRef: MutableRefObject<string[]>;
  /** Optional: passive load state. Omitted by legacy callers/tests. */
  passiveIdsRef?: MutableRefObject<string[]>;
  metadata: Map<string, ModMetadata>;
  cacheRef: MutableRefObject<Record<string, ModMetadata>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setConfiguredIds?: Dispatch<SetStateAction<string[]>>;
  setDisabledIds: Dispatch<SetStateAction<string[]>>;
  setPassiveIds?: Dispatch<SetStateAction<string[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setWarning: Dispatch<SetStateAction<string | null>>;
  /**
   * When set, optimistic writers pause profile content sync for the write so a
   * stale poll cannot clobber the mirror or skip sameIdSet rollback (#635).
   */
  profileSyncPausedRef?: MutableRefObject<boolean>;
  flushProfileSync?: () => void;
  persist: (
    nextIds: string[],
    nextDisabled: string[],
    nextCache: Record<string, ModMetadata>,
    nextPassive?: string[],
  ) => Promise<void>;
  notifyMapModIfNeeded: (id: string, meta: ModMetadata | undefined) => Promise<void>;
}

/**
 * Set equality, not membership of a list: duplicate entries must not make two different lists
 * compare equal (`["x","x"]` vs `["x","y"]` passes a multiset check), and `includes` inside a
 * loop rescans the list. Order-insensitive, which is what the rollback needs - array identity
 * was too strict (any copy would silently stop the revert) and a naive scan too loose.
 */
function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  const aSet = new Set(a);
  if (aSet.size !== a.length) {
    return false;
  }
  const bSet = new Set(b);
  return aSet.size === bSet.size && a.every((id) => bSet.has(id));
}

export function createServerModsListMutations(input: Input) {
  let passiveWriteInFlight = false;
  const readPassive = (): string[] => input.passiveIdsRef?.current ?? [];
  const writePassive = (next: string[]): void => {
    if (input.passiveIdsRef) input.passiveIdsRef.current = next;
    input.setPassiveIds?.(next);
  };

  /** Pause profile→mirror sync for the duration of an optimistic write. */
  const withProfileSyncPaused = async <T>(work: () => Promise<T>): Promise<T> => {
    const pauseRef = input.profileSyncPausedRef;
    if (pauseRef === undefined) return work();
    pauseRef.current = true;
    try {
      return await work();
    } finally {
      pauseRef.current = false;
      input.flushProfileSync?.();
    }
  };

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
    const previousPassive = readPassive();
    const nextDisabled = enabled
      ? previousDisabled.filter((candidate) => candidate !== id)
      : [...new Set([...previousDisabled, id])];
    // Passive implies enabled: disabling a row drops its passive mark.
    const nextPassive = enabled ? previousPassive : previousPassive.filter((candidate) => candidate !== id);
    await withProfileSyncPaused(async () => {
      input.disabledIdsRef.current = nextDisabled;
      input.setDisabledIds(nextDisabled);
      writePassive(nextPassive);
      let persisted = false;
      try {
        await input.persist(configuredIds, nextDisabled, input.cacheRef.current, nextPassive);
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
        if (
          !persisted &&
          sameIdSet(input.disabledIdsRef.current, nextDisabled) &&
          sameIdSet(readPassive(), nextPassive)
        ) {
          input.disabledIdsRef.current = previousDisabled;
          input.setDisabledIds(previousDisabled);
          writePassive(previousPassive);
        }
        input.setError(cause instanceof Error ? cause.message : "Could not update the mod");
      }
    });
  };

  /** Optimistic like {@link toggle}; passive requires the row to be enabled. */
  const setPassive = async (id: string, passive: boolean) => {
    if (passiveWriteInFlight) return;
    const configuredIds = input.configuredIdsRef.current;
    const disabledIds = input.disabledIdsRef.current;
    if (!configuredIds.includes(id) || (passive && disabledIds.includes(id))) return;
    const previousPassive = readPassive();
    if (previousPassive.includes(id) === passive) return;
    input.setError(null);
    input.setWarning(null);
    const nextPassive = passive
      ? [...new Set([...previousPassive, id])]
      : previousPassive.filter((candidate) => candidate !== id);
    passiveWriteInFlight = true;
    input.setBusyKey(MODS_BULK_BUSY_KEY);
    writePassive(nextPassive);
    try {
      await input.persist(configuredIds, disabledIds, input.cacheRef.current, nextPassive);
    } catch (cause) {
      if (sameIdSet(readPassive(), nextPassive)) {
        writePassive(previousPassive);
      }
      input.setError(cause instanceof Error ? cause.message : "Could not update the mod");
    } finally {
      passiveWriteInFlight = false;
      input.setBusyKey(null);
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
    const previousPassive = readPassive();
    const nextPassive = readPassive().filter((candidate) => candidate !== id);
    writePassive(nextPassive);
    try {
      await input.persist(
        configuredIds.filter((candidate) => candidate !== id),
        disabledIds.filter((candidate) => candidate !== id),
        nextCache,
        nextPassive,
      );
      return true;
    } catch (cause) {
      if (sameIdSet(readPassive(), nextPassive)) {
        writePassive(previousPassive);
      }
      input.setError(cause instanceof Error ? cause.message : "Could not remove the mod");
      return false;
    } finally {
      input.setBusyKey(null);
    }
  };

  /** Shared busy/error scaffolding for one-shot list writes (reorder + bulk). */
  const runListWrite = async (busyKey: string, fallbackError: string, work: () => Promise<void>) => {
    input.setBusyKey(busyKey);
    input.setError(null);
    input.setWarning(null);
    try {
      await work();
    } catch (cause) {
      input.setError(cause instanceof Error ? cause.message : fallbackError);
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
    await runListWrite(MODS_REORDER_BUSY_KEY, "Could not reorder mods", () =>
      input.persist(orderedIds, disabledIds, input.cacheRef.current),
    );
  };

  /** Bulk: clear `disabledMods`. One patch; one aggregated Maps-mod toast. */
  const enableAll = async () => {
    const disabledIds = input.disabledIdsRef.current;
    if (disabledIds.length === 0) return;
    await runListWrite(MODS_BULK_BUSY_KEY, "Could not enable all mods", async () => {
      await input.persist(input.configuredIdsRef.current, [], input.cacheRef.current);
      notifyMapModsEnabled(disabledIds, input.cacheRef.current);
    });
  };

  /** Bulk: `disabledMods` = every configured ID. One patch. */
  const disableAll = async () => {
    const configuredIds = input.configuredIdsRef.current;
    if (configuredIds.length === 0 || input.disabledIdsRef.current.length === configuredIds.length) return;
    // No optimistic write: `runListWrite` has no rollback, and `persist` applies the
    // next state on success. Nothing can stay passive once every mod is disabled.
    await runListWrite(MODS_BULK_BUSY_KEY, "Could not disable all mods", () =>
      input.persist(configuredIds, [...configuredIds], input.cacheRef.current, []),
    );
  };

  /** Bulk: drop disabled IDs from `mods` / `disabledMods` / `passiveMods` and clear their cache. One patch. */
  const removeAllDisabled = async () => {
    const configuredIds = input.configuredIdsRef.current;
    const disabledIds = input.disabledIdsRef.current;
    if (disabledIds.length === 0) return;
    const disabledSet = new Set(disabledIds);
    const nextIds = configuredIds.filter((id) => !disabledSet.has(id));
    const nextPassive = readPassive().filter((id) => !disabledSet.has(id));
    const nextCache = { ...input.cacheRef.current };
    for (const id of disabledIds) {
      delete nextCache[id];
    }
    await runListWrite(MODS_BULK_BUSY_KEY, "Could not remove disabled mods", () =>
      input.persist(nextIds, [], nextCache, nextPassive),
    );
  };

  /** Selection bulk (#635): enable chosen IDs in one patch; one aggregated Maps-mod toast. */
  const enableSelected = async (ids: readonly string[]) => {
    const configuredSet = new Set(input.configuredIdsRef.current);
    const selectedSet = new Set(ids.filter((id) => configuredSet.has(id)));
    if (selectedSet.size === 0) return;
    const previousDisabled = input.disabledIdsRef.current;
    const selectedDisabled = previousDisabled.filter((id) => selectedSet.has(id));
    if (selectedDisabled.length === 0) return;
    const disableSet = new Set(selectedDisabled);
    const nextDisabled = previousDisabled.filter((id) => !disableSet.has(id));
    await withProfileSyncPaused(async () => {
      input.disabledIdsRef.current = nextDisabled;
      input.setDisabledIds(nextDisabled);
      let persisted = false;
      await runListWrite(MODS_BULK_BUSY_KEY, "Could not enable selected mods", async () => {
        await input.persist(input.configuredIdsRef.current, nextDisabled, input.cacheRef.current);
        persisted = true;
        notifyMapModsEnabled(selectedDisabled, input.cacheRef.current);
      });
      if (!persisted && sameIdSet(input.disabledIdsRef.current, nextDisabled)) {
        input.disabledIdsRef.current = previousDisabled;
        input.setDisabledIds(previousDisabled);
      }
    });
  };

  /** Selection bulk (#635): disable chosen IDs in one patch; drops passive marks on those rows. */
  const disableSelected = async (ids: readonly string[]) => {
    const configuredIds = input.configuredIdsRef.current;
    const configuredSet = new Set(configuredIds);
    const selectedConfigured = ids.filter((id) => configuredSet.has(id));
    if (selectedConfigured.length === 0) return;
    const previousDisabled = input.disabledIdsRef.current;
    const previousPassive = readPassive();
    const nextDisabled = [...new Set([...previousDisabled, ...selectedConfigured])];
    // Union size unchanged ⇒ every selected ID was already disabled.
    if (nextDisabled.length === previousDisabled.length) return;
    const selectedSet = new Set(selectedConfigured);
    const nextPassive = previousPassive.filter((id) => !selectedSet.has(id));
    await withProfileSyncPaused(async () => {
      input.disabledIdsRef.current = nextDisabled;
      input.setDisabledIds(nextDisabled);
      writePassive(nextPassive);
      let persisted = false;
      await runListWrite(MODS_BULK_BUSY_KEY, "Could not disable selected mods", async () => {
        await input.persist(configuredIds, nextDisabled, input.cacheRef.current, nextPassive);
        persisted = true;
      });
      if (
        !persisted &&
        sameIdSet(input.disabledIdsRef.current, nextDisabled) &&
        sameIdSet(readPassive(), nextPassive)
      ) {
        input.disabledIdsRef.current = previousDisabled;
        input.setDisabledIds(previousDisabled);
        writePassive(previousPassive);
      }
    });
  };

  /** Selection bulk (#635): remove chosen IDs from mods / disabled / passive / cache. One patch. */
  const removeSelected = async (ids: readonly string[]): Promise<boolean> => {
    const configuredIds = input.configuredIdsRef.current;
    const configuredSet = new Set(configuredIds);
    const selectedConfigured = ids.filter((id) => configuredSet.has(id));
    if (selectedConfigured.length === 0) return true;
    const selectedSet = new Set(selectedConfigured);
    const previousDisabled = input.disabledIdsRef.current;
    const previousPassive = readPassive();
    const previousCache = input.cacheRef.current;
    const nextIds = configuredIds.filter((id) => !selectedSet.has(id));
    const nextDisabled = previousDisabled.filter((id) => !selectedSet.has(id));
    const nextPassive = previousPassive.filter((id) => !selectedSet.has(id));
    const nextCache = { ...previousCache };
    for (const id of selectedConfigured) {
      delete nextCache[id];
    }
    return withProfileSyncPaused(async () => {
      // Optimistic list update so header counts and rows move with the confirm action.
      input.configuredIdsRef.current = nextIds;
      input.setConfiguredIds?.(nextIds);
      input.disabledIdsRef.current = nextDisabled;
      input.setDisabledIds(nextDisabled);
      writePassive(nextPassive);
      input.cacheRef.current = nextCache;
      let persisted = false;
      await runListWrite(MODS_BULK_BUSY_KEY, "Could not remove selected mods", async () => {
        await input.persist(nextIds, nextDisabled, nextCache, nextPassive);
        persisted = true;
      });
      if (
        !persisted &&
        sameIdSet(input.configuredIdsRef.current, nextIds) &&
        sameIdSet(input.disabledIdsRef.current, nextDisabled) &&
        sameIdSet(readPassive(), nextPassive)
      ) {
        input.configuredIdsRef.current = configuredIds;
        input.setConfiguredIds?.(configuredIds);
        input.disabledIdsRef.current = previousDisabled;
        input.setDisabledIds(previousDisabled);
        writePassive(previousPassive);
        input.cacheRef.current = previousCache;
      }
      return persisted;
    });
  };

  return {
    add,
    toggle,
    remove,
    reorder,
    enableAll,
    disableAll,
    removeAllDisabled,
    enableSelected,
    disableSelected,
    removeSelected,
    setPassive,
  };
}
