import { useCallback, useState } from "react";
import {
  readStoredSortMode,
  readStoredViewMode,
  type ServerListSortMode,
  type ServerListSurface,
  type ServerListViewMode,
  writeStoredSortMode,
  writeStoredViewMode,
} from "../serverListModel";

export function useServerListPreferences(surface: ServerListSurface): {
  sort: ServerListSortMode;
  setSort: (mode: ServerListSortMode) => void;
  view: ServerListViewMode;
  setView: (mode: ServerListViewMode) => void;
} {
  const [sort, setSortState] = useState<ServerListSortMode>(() => readStoredSortMode());
  const [view, setViewState] = useState<ServerListViewMode>(() => readStoredViewMode(surface));

  const setSort = useCallback((mode: ServerListSortMode) => {
    setSortState(mode);
    writeStoredSortMode(mode);
  }, []);

  const setView = useCallback((mode: ServerListViewMode) => {
    setViewState(mode);
    writeStoredViewMode(mode);
  }, []);

  return { sort, setSort, view, setView };
}
