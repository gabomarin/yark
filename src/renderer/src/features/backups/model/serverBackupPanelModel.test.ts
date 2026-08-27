import { describe, expect, it } from "vitest";
import type { BackupRecord } from "@shared/types";
import {
  buildServerBackupMetricStrip,
  type DraftPolicy,
} from "./serverBackupPanelModel";

const draft: DraftPolicy = {
  enabled: true,
  intervalMinutes: 60,
  retainCountWorld: 12,
  retainCountPlayers: 8,
  retainCountIni: 5,
  backupDir: null,
};

const world: BackupRecord = {
  id: "bk-1",
  serverId: "srv-1",
  type: "manual",
  kind: "world",
  path: "C:/backups/world",
  sizeBytes: 100,
  status: "completed",
  createdAt: "2026-07-24T12:00:00.000Z",
  completedAt: "2026-07-24T12:01:00.000Z",
  notes: null,
  mapToken: "TheIsland_WP",
};

describe("buildServerBackupMetricStrip", () => {
  it("uses newest completed backup age and kind retain count", () => {
    const strip = buildServerBackupMetricStrip({
      backups: [world],
      kind: "world",
      draft,
      resolvedRoot: "C:/ARK/srv-1/Backups",
      defaultBackupHint: "C:/ARK/srv-1/Backups",
      nowMs: new Date("2026-07-24T13:01:00.000Z").getTime(),
    });
    expect(strip.lastBackupValue).toMatch(/hour|ago|1/i);
    expect(strip.retainValue).toBe("12");
    expect(strip.retainHint).toBe("Per map");
    expect(strip.destinationHint).toBe("Default under install");
  });

  it("shows Never when no completed backup exists for the kind", () => {
    const strip = buildServerBackupMetricStrip({
      backups: [world],
      kind: "ini",
      draft,
      resolvedRoot: null,
      defaultBackupHint: "C:/ARK/default",
    });
    expect(strip.lastBackupValue).toBe("Never");
    expect(strip.retainValue).toBe("5");
  });

  it("labels custom destinations", () => {
    const strip = buildServerBackupMetricStrip({
      backups: [],
      kind: "players",
      draft: { ...draft, backupDir: "D:/Custom/Backups" },
      resolvedRoot: "C:/ARK/srv-1/Backups",
      defaultBackupHint: "C:/ARK/srv-1/Backups",
    });
    expect(strip.destinationHint).toBe("Custom destination");
    expect(strip.retainValue).toBe("8");
    expect(strip.retainHint).toBe("Per player");
  });
});
