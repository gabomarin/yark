/** Busy key while load-order persist is in flight (`createServerModsListMutations`). */
export const MODS_REORDER_BUSY_KEY = "reorder";

export function isModsListBusy(busyKey: string | null): boolean {
  return busyKey === MODS_REORDER_BUSY_KEY;
}
