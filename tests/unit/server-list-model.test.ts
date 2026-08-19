/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import type { ServerProfile } from "@shared/types";
import {
  SERVER_LIST_SORT_STORAGE_KEY,
  SERVER_LIST_VIEW_STORAGE_KEY,
  readStoredSortMode,
  readStoredViewMode,
  sortServers,
  writeStoredSortMode,
  writeStoredViewMode,
} from "@features/servers/serverListModel";

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-1",
    name: "The Island",
    map: "TheIsland_WP",
    installDir: "C:\\ARK\\TheIsland",
    enabled: true,
    autoStart: false,
    sessionName: "YARK",
    maxPlayers: 70,
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

describe("serverListModel", () => {
  afterEach(() => {
    window.localStorage.removeItem(SERVER_LIST_SORT_STORAGE_KEY);
    window.localStorage.removeItem(SERVER_LIST_VIEW_STORAGE_KEY);
  });

  it("defaults sort to created and persists alphabetical choice", () => {
    expect(readStoredSortMode()).toBe("created");
    writeStoredSortMode("name");
    expect(window.localStorage.getItem(SERVER_LIST_SORT_STORAGE_KEY)).toBe("name");
    expect(readStoredSortMode()).toBe("name");
  });

  it("uses surface defaults for view until a preference is stored", () => {
    expect(readStoredViewMode("overview")).toBe("ungrouped");
    expect(readStoredViewMode("workspace")).toBe("grouped");
    writeStoredViewMode("grouped");
    expect(readStoredViewMode("overview")).toBe("grouped");
    expect(readStoredViewMode("workspace")).toBe("grouped");
  });

  it("sorts oldest createdAt first and tie-breaks id (not UUID order)", () => {
    const sorted = sortServers(
      [
        profile({ id: "bbb", name: "Zeta", createdAt: "2026-02-01T00:00:00.000Z" }),
        profile({ id: "aaa", name: "Alpha", createdAt: "2026-01-01T00:00:00.000Z" }),
        profile({ id: "ccc", name: "Beta", createdAt: "2026-01-01T00:00:00.000Z" }),
      ],
      "created",
    );
    expect(sorted.map((row) => row.id)).toEqual(["aaa", "ccc", "bbb"]);
  });

  it("sorts alphabetically by name with id tie-break", () => {
    const sorted = sortServers(
      [
        profile({ id: "z-id", name: "Zeta" }),
        profile({ id: "a-id", name: "Alpha" }),
        profile({ id: "m-id", name: "Alpha" }),
      ],
      "name",
    );
    expect(sorted.map((row) => row.id)).toEqual(["a-id", "m-id", "z-id"]);
  });
});
