import { describe, expect, it } from "vitest";
import type { ServerRuntimeInfo, SteamCmdStatus } from "../src/shared/types";
import {
  reconcileEvents,
  reconcileStatusMap,
  reconcileSteamCmdStatus,
  upsertPlayerListState,
} from "../src/renderer/src/shared/reconcilePollSnapshots";

describe("reconcilePollSnapshots", () => {
  it("reuses the status map when runtime rows are unchanged", () => {
    const row: ServerRuntimeInfo = {
      serverId: "a",
      status: "running",
      processLive: true,
      pid: 1,
      startedAt: "t",
      lastError: null,
    };
    const previous = new Map([["a", row]]);
    const next = reconcileStatusMap(previous, [{ ...row }]);
    expect(next).toBe(previous);
    expect(next.get("a")).toBe(row);
  });

  it("reuses steamcmd status when fields match", () => {
    const previous: SteamCmdStatus = {
      detected: true,
      executablePath: "C:/steamcmd.exe",
      depotCacheDir: null,
      contentCacheDir: null,
      busy: false,
      running: false,
      operation: null,
      serverId: null,
      startedAt: null,
      pid: null,
      progressPercent: null,
      progressLabel: null,
      progressBytesDownloaded: null,
      progressBytesTotal: null,
      lastLine: null,
      queuedCount: 0,
      criticalJobs: [],
      checkedAt: "t1",
    };
    const next = reconcileSteamCmdStatus(previous, { ...previous });
    expect(next).toBe(previous);
  });

  it("ignores steamcmd checkedAt clock skew on quiet snapshots", () => {
    const previous: SteamCmdStatus = {
      detected: true,
      executablePath: "C:/steamcmd.exe",
      depotCacheDir: null,
      contentCacheDir: null,
      busy: false,
      running: false,
      operation: null,
      serverId: null,
      startedAt: null,
      pid: null,
      progressPercent: null,
      progressLabel: null,
      progressBytesDownloaded: null,
      progressBytesTotal: null,
      lastLine: null,
      queuedCount: 0,
      criticalJobs: [],
      checkedAt: "t1",
    };
    const next = reconcileSteamCmdStatus(previous, {
      ...previous,
      checkedAt: "t2",
    });
    expect(next).toBe(previous);
  });

  it("treats missing criticalJobs as empty for steamcmd reconcile", () => {
    const previous = {
      detected: true,
      executablePath: "C:/steamcmd.exe",
      depotCacheDir: null,
      contentCacheDir: null,
      busy: false,
      running: false,
      operation: null,
      serverId: null,
      startedAt: null,
      pid: null,
      progressPercent: null,
      progressLabel: null,
      progressBytesDownloaded: null,
      progressBytesTotal: null,
      lastLine: null,
      queuedCount: 0,
      checkedAt: "t1",
    } as SteamCmdStatus;
    const next = reconcileSteamCmdStatus(previous, {
      ...previous,
      criticalJobs: [],
      checkedAt: "t2",
    });
    expect(next).toBe(previous);
  });

  it("reuses events when ids match", () => {
    const previous = [{ id: 1 }, { id: 2 }] as never[];
    expect(reconcileEvents(previous, [{ id: 1 }, { id: 2 }] as never[])).toBe(
      previous,
    );
  });

  it("reuses the player-list map when roster content is unchanged", () => {
    const state = {
      players: [{ key: "1", name: "Alice" }],
      error: null,
      loading: false,
    };
    const previous = new Map([["a", state]]);
    const next = upsertPlayerListState(previous, "a", {
      players: [{ key: "1", name: "Alice" }],
      error: null,
      loading: false,
    });
    expect(next).toBe(previous);
    expect(next.get("a")).toBe(state);
  });
});
