import { useCallback, useState } from "react";
import {
  ICON_RAIL_PX,
  LIST_FULL_PX,
  listWidthForMode,
  readStoredListMode,
  writeStoredListMode,
  type WorkspaceListMode,
} from "./workspaceLayoutModel";

export interface WorkspaceListRailState {
  mode: WorkspaceListMode;
  iconMode: boolean;
  listWidthPx: number;
  toggleRail: () => void;
  setMode: (mode: WorkspaceListMode) => void;
}

export function useWorkspaceListRail(): WorkspaceListRailState {
  const [mode, setModeState] = useState<WorkspaceListMode>(() => readStoredListMode());

  const setMode = useCallback((next: WorkspaceListMode) => {
    setModeState(next);
    writeStoredListMode(next);
  }, []);

  const toggleRail = useCallback(() => {
    setModeState((current) => {
      const next: WorkspaceListMode = current === "rail" ? "full" : "rail";
      writeStoredListMode(next);
      return next;
    });
  }, []);

  return {
    mode,
    iconMode: mode === "rail",
    listWidthPx: listWidthForMode(mode),
    toggleRail,
    setMode,
  };
}

export { ICON_RAIL_PX, LIST_FULL_PX };
