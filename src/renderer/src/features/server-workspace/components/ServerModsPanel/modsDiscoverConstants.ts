import type { ModsSearchSortField, ModsSearchSortOrder } from "@shared/types";
import type { ModRowSortAccessor } from "./serverModsModel";

/** Discover page size — matches CurseForge default browse density (#297). */
export const DISCOVER_PAGE_SIZE = 20;

/** Default catalog sort: Popularity descending (CurseForge sortField=2). */
export const DISCOVER_DEFAULT_SORT_FIELD: ModsSearchSortField = 2;
export const DISCOVER_DEFAULT_SORT_ORDER: ModsSearchSortOrder = "desc";

export function isDiscoverDefaultSort(
  sortField: ModsSearchSortField,
  sortOrder: ModsSearchSortOrder,
): boolean {
  return (
    sortField === DISCOVER_DEFAULT_SORT_FIELD
    && sortOrder === DISCOVER_DEFAULT_SORT_ORDER
  );
}

/** Column accessors that map to CurseForge search sort fields. */
const COLUMN_TO_FIELD: Record<ModRowSortAccessor, ModsSearchSortField> = {
  name: 4,
  downloadCount: 6,
  updatedAt: 3,
};

const FIELD_TO_COLUMN: Partial<Record<ModsSearchSortField, ModRowSortAccessor>> = {
  4: "name",
  6: "downloadCount",
  3: "updatedAt",
};

export function discoverSortFromColumn(
  columnAccessor: string,
  direction: "asc" | "desc",
): { sortField: ModsSearchSortField; sortOrder: ModsSearchSortOrder } | null {
  if (
    columnAccessor !== "name"
    && columnAccessor !== "downloadCount"
    && columnAccessor !== "updatedAt"
  ) {
    return null;
  }
  return {
    sortField: COLUMN_TO_FIELD[columnAccessor],
    sortOrder: direction,
  };
}

export function discoverColumnSort(
  sortField: ModsSearchSortField,
  sortOrder: ModsSearchSortOrder,
): { columnAccessor: ModRowSortAccessor; direction: "asc" | "desc" } | null {
  const columnAccessor = FIELD_TO_COLUMN[sortField];
  if (columnAccessor === undefined) return null;
  return { columnAccessor, direction: sortOrder };
}
