import { afterEach, describe, expect, it } from "vitest";
import {
  ICON_RAIL_PX,
  LIST_FULL_PX,
  LIST_RAIL_STORAGE_KEY,
  LIST_WIDTH_STORAGE_KEY,
  groupServersByCluster,
  listWidthForMode,
  readStoredListMode,
  writeStoredListMode,
} from "@features/server-workspace/workspaceLayoutModel";
import type { ServerProfile } from "@shared/types";

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-1",
    name: "The Island",
    map: "TheIsland_WP",
    installDir: "C:\\ARK\\TheIsland",
    enabled: true,
    autoStart: false,
    sessionName: "YARK",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("workspaceLayoutModel", () => {
  afterEach(() => {
    window.localStorage.removeItem(LIST_RAIL_STORAGE_KEY);
    window.localStorage.removeItem(LIST_WIDTH_STORAGE_KEY);
  });

  it("maps Full and Rail to fixed widths", () => {
    expect(listWidthForMode("full")).toBe(LIST_FULL_PX);
    expect(listWidthForMode("rail")).toBe(ICON_RAIL_PX);
  });

  it("persists explicit rail mode in localStorage", () => {
    expect(readStoredListMode()).toBe("full");
    writeStoredListMode("rail");
    expect(window.localStorage.getItem(LIST_RAIL_STORAGE_KEY)).toBe("1");
    expect(readStoredListMode()).toBe("rail");
    writeStoredListMode("full");
    expect(readStoredListMode()).toBe("full");
  });

  it("migrates a narrow legacy continuum width to rail once", () => {
    window.localStorage.setItem(LIST_WIDTH_STORAGE_KEY, "72");
    expect(readStoredListMode()).toBe("rail");
    expect(window.localStorage.getItem(LIST_WIDTH_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LIST_RAIL_STORAGE_KEY)).toBe("1");
  });

  it("groups servers by cluster with Unclustered last", () => {
    const groups = groupServersByCluster([
      profile({ id: "u", name: "Solo", clusterId: null }),
      profile({ id: "b", name: "Beta One", clusterId: "Beta" }),
      profile({ id: "a", name: "Alpha One", clusterId: "Alpha" }),
      profile({ id: "a2", name: "Alpha Two", clusterId: "Alpha" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Alpha", "Beta", "Unclustered"]);
    expect(groups[0]?.servers).toHaveLength(2);
    expect(groups[2]?.servers[0]?.id).toBe("u");
  });
});
