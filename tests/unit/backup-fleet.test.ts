import { describe, expect, it } from "vitest";
import {
  buildBackupServerHealthRow,
  computeBackupServerHealth,
  computeFleetSummaryStats,
  filterDismissedFleetAlerts,
  normalizeDiskAlertSettings,
} from "@backend/domains/backups/backup-fleet";
import type { BackupServerHealth } from "@shared/types";

describe("computeBackupServerHealth", () => {
  it("marks never-backed-up as warning only while the server is running", () => {
    expect(
      computeBackupServerHealth({
        destinationOk: true,
        stale: true,
        failed24h: 0,
        failedWorld24h: 0,
        scheduleEnabled: true,
        hasWorldBackup: false,
        serverRunning: false,
      }),
    ).toBe("unknown");

    expect(
      computeBackupServerHealth({
        destinationOk: true,
        stale: false,
        failed24h: 0,
        failedWorld24h: 0,
        scheduleEnabled: true,
        hasWorldBackup: false,
        serverRunning: true,
      }),
    ).toBe("warning");
  });

  it("treats failed world backups as critical, but INI/player failures as warning", () => {
    expect(
      computeBackupServerHealth({
        destinationOk: true,
        stale: false,
        failed24h: 1,
        failedWorld24h: 0,
        scheduleEnabled: true,
        hasWorldBackup: true,
        serverRunning: true,
      }),
    ).toBe("warning");

    expect(
      computeBackupServerHealth({
        destinationOk: true,
        stale: false,
        failed24h: 1,
        failedWorld24h: 1,
        scheduleEnabled: true,
        hasWorldBackup: true,
        serverRunning: true,
      }),
    ).toBe("critical");
  });
});

describe("buildBackupServerHealthRow", () => {
  it("marks stale when schedule is on and the server is running without a world backup", () => {
    const row = buildBackupServerHealthRow({
      serverId: "srv-1",
      serverName: "Island",
      policy: {
        serverId: "srv-1",
        enabled: true,
        intervalMinutes: 60,
        retainCountWorld: 2,
        retainCountPlayers: 2,
        retainCountIni: 2,
        backupDir: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      resolvedRoot: "C:\\Backups",
      records: [],
      latestWorld: null,
      destinationOk: true,
      serverRunning: true,
      schedulePaused: false,
    });
    expect(row.stale).toBe(true);
    expect(row.health).toBe("warning");
  });
});

describe("filterDismissedFleetAlerts", () => {
  it("hides matching fingerprints and prunes stale dismiss rows", () => {
    const alerts = [{
      id: "failed:srv-1",
      kind: "failed" as const,
      severity: "error" as const,
      serverId: "srv-1",
      volumePath: null,
      fingerprint: "a:1",
      message: "failed",
    }];
    const { visible, prunedDismissed } = filterDismissedFleetAlerts(alerts, {
      "failed:srv-1": { fingerprint: "a:1", dismissedAt: "2026-01-01T00:00:00.000Z" },
      stale: { fingerprint: "old", dismissedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(visible).toHaveLength(0);
    expect(Object.keys(prunedDismissed)).toEqual(["failed:srv-1"]);
  });
});

describe("computeFleetSummaryStats", () => {
  it("aggregates protected and at-risk counts", () => {
    const rows = [
      { health: "ok", counts: { failed24h: 0 }, usedBytes: 10 },
      { health: "critical", counts: { failed24h: 2 }, usedBytes: 20 },
    ] as BackupServerHealth[];
    expect(computeFleetSummaryStats(rows)).toEqual({
      protectedCount: 1,
      atRiskCount: 1,
      failed24h: 2,
      totalBackupBytes: 30,
    });
  });
});

describe("normalizeDiskAlertSettings", () => {
  it("clamps thresholds into valid ranges", () => {
    expect(
      normalizeDiskAlertSettings({
        warnUsedPercent: 10,
        criticalUsedPercent: 20,
        warnFreeBytes: 1,
      }),
    ).toEqual({
      warnUsedPercent: 50,
      criticalUsedPercent: 51,
      warnFreeBytes: 1024 * 1024 * 1024,
    });
  });
});
