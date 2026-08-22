import { describe, expect, it } from "vitest";
import {
  deriveSteamCmdStatusOperation,
  deriveSteamCmdStatusServerId,
  deriveSteamCmdStatusStartedAt,
  formatAsaCacheReuseLine,
  formatAsaCacheSyncTargetLine,
  formatAsaCacheUpdateConsoleLine,
  formatDiskProgressLogPathLine,
  formatSteamCmdCachePathsLine,
  formatSteamCmdInvokeConsoleLines,
  formatSyncCompletedLine,
  formatSyncFailureFallbackLine,
  formatSyncHeartbeatLine,
  planSteamCmdProcessProgressStart,
  resolveAsaCacheSyncCompleteProgress,
  resolveAsaCacheSyncLabel,
  resolveAsaCacheSyncSkippedProgress,
  shouldPreferOfficialProgressOverDiskEstimate,
} from "@backend/domains/updates/steamcmd-operator";

describe("planSteamCmdProcessProgressStart", () => {
  it("maps each operation to initial progress copy", () => {
    expect(planSteamCmdProcessProgressStart("install-files").label)
      .toContain("Downloading");
    expect(planSteamCmdProcessProgressStart("verify-files").line)
      .toContain("validate");
    expect(planSteamCmdProcessProgressStart("install-steamcmd").percent).toBeNull();
  });
});

describe("ASA cache console helpers", () => {
  it("formats cache and sync copy", () => {
    expect(formatSteamCmdCachePathsLine("D:/depot", "D:/content"))
      .toContain("depot=D:/depot");
    expect(formatAsaCacheReuseLine(12)).toContain("12s");
    expect(formatAsaCacheUpdateConsoleLine("verify-files", "D:/steam"))
      .toContain("validate");
    expect(formatAsaCacheSyncTargetLine("C:/ARK")).toContain("ShooterGame");
    expect(resolveAsaCacheSyncLabel("install-files")).toContain("Copying");
    expect(resolveAsaCacheSyncSkippedProgress("update").percent).toBe(100);
    expect(resolveAsaCacheSyncCompleteProgress("verify-files").label)
      .toBe("Integrity OK");
    expect(formatSyncHeartbeatLine(5)).toContain("5s");
    expect(formatSyncCompletedLine(1)).toContain("robocopy=1");
    expect(formatSyncFailureFallbackLine("busy")).toContain("directly");
  });
});

describe("invoke and disk progress helpers", () => {
  it("formats invoke lines and log path", () => {
    const lines = formatSteamCmdInvokeConsoleLines({
      operation: "update",
      serverId: "srv-1",
      steamCmdHome: "D:/steam",
      steamcmdExe: "D:/steam/steamcmd.exe",
      args: ["+run"],
    });
    expect(lines[0]).toContain("op=update");
    expect(lines[1]).toContain("console_log.txt");
    expect(formatDiskProgressLogPathLine("D:/steam/logs/console_log.txt"))
      .toContain("Following live log");
  });

  it("prefers recent official progress over disk estimates", () => {
    const now = 10_000;
    expect(shouldPreferOfficialProgressOverDiskEstimate(9_000, now)).toBe(true);
    expect(shouldPreferOfficialProgressOverDiskEstimate(4_000, now)).toBe(false);
  });
});

describe("status derivation helpers", () => {
  it("prefers sync-files over active SteamCMD operation", () => {
    expect(
      deriveSteamCmdStatusOperation({
        syncingServerId: "srv-1",
        activeOperation: "update",
        runningJobType: null,
      }),
    ).toBe("sync-files");
    expect(
      deriveSteamCmdStatusServerId({
        syncingServerId: "srv-sync",
        activeServerId: "srv-active",
        runningJobServerId: "srv-queue",
      }),
    ).toBe("srv-sync");
    expect(
      deriveSteamCmdStatusStartedAt({
        syncingStartedAt: "sync",
        activeStartedAt: "active",
        runningJobUpdatedAt: "queue",
      }),
    ).toBe("sync");
  });
});
