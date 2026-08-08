import { useCallback, useState } from "react";
import {
  CHROME_ICON_RAIL_PX,
  readStoredSidebarRailMode,
  writeStoredSidebarRailMode,
  type ChromeRailMode,
} from "./chromeRailModel";

export interface SidebarRailState {
  mode: ChromeRailMode;
  iconMode: boolean;
  railWidthPx: number;
  toggleRail: () => void;
}

export function useSidebarRail(fullWidthPx: number): SidebarRailState {
  const [mode, setMode] = useState<ChromeRailMode>(() => readStoredSidebarRailMode());

  const toggleRail = useCallback(() => {
    setMode((current) => {
      const next: ChromeRailMode = current === "rail" ? "full" : "rail";
      writeStoredSidebarRailMode(next);
      return next;
    });
  }, []);

  const iconMode = mode === "rail";
  return {
    mode,
    iconMode,
    railWidthPx: iconMode ? CHROME_ICON_RAIL_PX : fullWidthPx,
    toggleRail,
  };
}
