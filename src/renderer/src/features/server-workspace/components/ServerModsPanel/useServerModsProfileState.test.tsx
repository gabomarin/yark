import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ServerProfile } from "@shared/types";
import { useServerModsProfileState } from "./useServerModsProfileState";

const baseServer: ServerProfile = {
  id: "server-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:\\ARK\\TheIsland",
  enabled: true,
  autoStart: false,
  useAsaApi: false,
  useAsaApiLoader: false,
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
  mods: ["a", "b"],
  disabledMods: ["b"],
  passiveMods: [],
  modMetadataCache: {},
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

describe("useServerModsProfileState", () => {
  it("defers content-key sync while paused, then flushes only a deferred poll (#635 OCR)", () => {
    const { result, rerender } = renderHook(
      ({ server }: { server: ServerProfile }) => useServerModsProfileState(server),
      { initialProps: { server: baseServer } },
    );

    expect(result.current.disabledIds).toEqual(["b"]);

    act(() => {
      result.current.profileSyncPausedRef.current = true;
      result.current.setDisabledIds([]);
    });
    expect(result.current.disabledIds).toEqual([]);

    // Mid-write poll with the pre-mutation profile (stale disabled list).
    rerender({ server: { ...baseServer, disabledMods: ["b"], mods: ["a", "b"] } });
    expect(result.current.disabledIds).toEqual([]);

    // Successful persist already updated the parent to the optimistic value — flush
    // must apply that snapshot, not silently no-op forever.
    rerender({ server: { ...baseServer, disabledMods: [], mods: ["a", "b"] } });
    expect(result.current.disabledIds).toEqual([]);

    act(() => {
      result.current.profileSyncPausedRef.current = false;
      result.current.flushProfileSync();
    });
    expect(result.current.disabledIds).toEqual([]);
  });

  it("does not re-apply an unchanged profile on flush when no poll arrived while paused", () => {
    const { result } = renderHook(() => useServerModsProfileState(baseServer));

    act(() => {
      result.current.profileSyncPausedRef.current = true;
      result.current.setDisabledIds([]);
    });
    act(() => {
      result.current.profileSyncPausedRef.current = false;
      result.current.flushProfileSync();
    });
    // No deferred poll → keep the optimistic mirror (persist owns the next parent snapshot).
    expect(result.current.disabledIds).toEqual([]);
  });
});
