import { suggestMapTokenFromMetadata } from "@shared/map-token-suggest";
import type {
  ModCategory,
  ModMetadata,
  ModSearchOptions,
  ModSearchPage,
  ModsSearchSortField,
  ModsSearchSortOrder,
} from "@shared/types";

/** Card grid page size for the Maps search modal (#295). */
export const MAPS_SEARCH_PAGE_SIZE = 12;

/** CurseForge Popularity desc — same default as Mods Discover (#297). */
const MAPS_SEARCH_SORT_FIELD = 2 as ModsSearchSortField;
const MAPS_SEARCH_SORT_ORDER = "desc" as ModsSearchSortOrder;

export interface MapsSearchApplyPayload {
  map: string;
  mapModId: string;
  mapSaveFolder: string | null;
  mod: ModMetadata;
}

export interface MapsSearchRow {
  mod: ModMetadata;
  token: ReturnType<typeof suggestMapTokenFromMetadata>;
}

/** Sentinel Select value — opens the CurseForge Maps search modal (#295). */
export const SEARCH_MAPS_SELECT_VALUE = "__yark_search_maps__";

const MAPS_LABEL = /\bmaps?\b/i;

/** Resolve ASA Maps class/category ids from Worker categories (#295). */
export function resolveMapsCategoryFilter(
  categories: ModCategory[],
): Pick<ModSearchOptions, "classId" | "categoryId"> {
  const mapsClass = categories.find(
    (entry) => entry.isClass && MAPS_LABEL.test(entry.name),
  );
  if (mapsClass !== undefined) {
    return { classId: mapsClass.id };
  }
  const mapsCategory = categories.find(
    (entry) => !entry.isClass && MAPS_LABEL.test(entry.name),
  );
  if (mapsCategory !== undefined) {
    return { categoryId: mapsCategory.id };
  }
  return {};
}

export function buildMapsSearchOptions(
  categoryFilter: Pick<ModSearchOptions, "classId" | "categoryId">,
  page: number,
): ModSearchOptions {
  return {
    index: (page - 1) * MAPS_SEARCH_PAGE_SIZE,
    pageSize: MAPS_SEARCH_PAGE_SIZE,
    sortField: MAPS_SEARCH_SORT_FIELD,
    sortOrder: MAPS_SEARCH_SORT_ORDER,
    ...categoryFilter,
  };
}

export function isValidMapLaunchToken(token: string): boolean {
  const trimmed = token.trim();
  return (
    trimmed.length > 0
    && trimmed.includes("_WP")
    && !/\s/.test(trimmed)
  );
}

export function buildMapsSearchRows(mods: ModMetadata[]): MapsSearchRow[] {
  return mods.map((mod) => ({
    mod,
    token: suggestMapTokenFromMetadata(mod),
  }));
}

/** Merge search hits with batch metadata (descriptions for token infer, #195). */
export async function enrichMapsSearchPage(
  page: ModSearchPage,
): Promise<ModMetadata[]> {
  const ids = page.items.map((item) => item.id);
  if (ids.length === 0) {
    return [];
  }
  const result = await window.api.getModsMetadata(ids);
  if (!result.ok) {
    return page.items;
  }
  const byId = new Map(result.data.map((item) => [item.id, item]));
  return page.items.map((item) => byId.get(item.id) ?? item);
}

export function applyMapsSearchToProfileFields(input: {
  mods: string[];
  disabledMods: string[];
  modMetadataCache: Record<string, ModMetadata>;
  payload: MapsSearchApplyPayload;
}): {
  mods: string[];
  disabledMods: string[];
  modMetadataCache: Record<string, ModMetadata>;
  map: string;
  mapModId: string;
  mapSaveFolder: string | null;
} {
  const { payload } = input;
  const mods = input.mods.includes(payload.mod.id)
    ? input.mods
    : [...input.mods, payload.mod.id];
  const disabledMods = input.disabledMods.filter((id) => id !== payload.mod.id);
  return {
    map: payload.map,
    mapModId: payload.mapModId,
    mapSaveFolder: payload.mapSaveFolder,
    mods,
    disabledMods,
    modMetadataCache: {
      ...input.modMetadataCache,
      [payload.mod.id]: payload.mod,
    },
  };
}
