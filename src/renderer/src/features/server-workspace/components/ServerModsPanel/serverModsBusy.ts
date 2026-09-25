/** Busy key while load-order persist is in flight (`createServerModsListMutations`). */
export const MODS_REORDER_BUSY_KEY = "reorder";

/** Busy key while a bulk enable/disable/remove-all write is in flight. */
export const MODS_BULK_BUSY_KEY = "bulk";

/** True for list-wide writes that disable drag and every row action. */
export function isModsListBusy(busyKey: string | null): boolean {
  return busyKey === MODS_REORDER_BUSY_KEY || busyKey === MODS_BULK_BUSY_KEY;
}
