import { afterEach, describe, expect, it } from "vitest";
import {
  CHROME_ICON_RAIL_PX,
  SIDEBAR_RAIL_STORAGE_KEY,
  readStoredSidebarRailMode,
  writeStoredSidebarRailMode,
} from "@layout/chromeRailModel";

describe("chromeRailModel", () => {
  afterEach(() => {
    window.localStorage.removeItem(SIDEBAR_RAIL_STORAGE_KEY);
  });

  it("defaults to full and persists sidebar rail mode", () => {
    expect(readStoredSidebarRailMode()).toBe("full");
    expect(CHROME_ICON_RAIL_PX).toBe(72);
    writeStoredSidebarRailMode("rail");
    expect(window.localStorage.getItem(SIDEBAR_RAIL_STORAGE_KEY)).toBe("1");
    expect(readStoredSidebarRailMode()).toBe("rail");
    writeStoredSidebarRailMode("full");
    expect(readStoredSidebarRailMode()).toBe("full");
  });
});
