import { describe, expect, it } from "vitest";
import { formatPlayerSessionNotes } from "@shared/backup-player-meta";
import {
  planBackupCleanup,
  summarizeCleanupPlan,
  type BackupCleanupPlannerCatalog,
} from "@backend/domains/backups/backup-cleanup-plan";
import type { BackupPolicy, BackupRecord } from "@shared/types";

function backup(
  partial: Partial<BackupRecord> & Pick<BackupRecord, "id" | "kind" | "status">,
): BackupRecord {
  return {
    serverId: "srv-1",
    type: "manual",
    path: `C:\\Backups\\${partial.id}.zip`,
    sizeBytes: 100,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.000Z",
    notes: null,
    mapToken: null,
    ...partial,
  };
}

function policy(overrides: Partial<BackupPolicy> = {}): BackupPolicy {
  return {
    serverId: "srv-1",
    enabled: true,
    intervalMinutes: 60,
    retainCountWorld: 2,
    retainCountPlayers: 2,
    retainCountIni: 2,
    backupDir: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function catalog(input: {
  policy?: BackupPolicy;
  backups?: BackupRecord[];
  completedByKind?: Partial<Record<BackupRecord["kind"], BackupRecord[]>>;
  latestWorld?: BackupRecord | null;
}): BackupCleanupPlannerCatalog {
  const all = input.backups ?? [];
  return {
    getPolicy: () => input.policy ?? policy(),
    listBackups: () => all,
    listCompleted: (_serverId, kind) => input.completedByKind?.[kind] ?? all.filter(
      (row) => row.kind === kind && row.status === "completed",
    ),
    latestCompleted: (_serverId, kind) => {
      if (kind === "world") return input.latestWorld ?? null;
      return null;
    },
  };
}

describe("planBackupCleanup", () => {
  it("requires at least one cleanup rule", () => {
    expect(() =>
      planBackupCleanup({
        options: {
          serverIds: null,
          includeFailed: false,
          enforceRetention: false,
          olderThanDays: null,
          keepLastPerKind: null,
          protectNewestWorld: true,
        },
        servers: [{ id: "srv-1", name: "Island" }],
        catalog: catalog({}),
      }),
    ).toThrow(/Select at least one cleanup rule/);
  });

  it("marks failed backups when includeFailed is set", () => {
    const failed = backup({ id: "f1", kind: "world", status: "failed" });
    const plan = planBackupCleanup({
      options: {
        serverIds: null,
        includeFailed: true,
        enforceRetention: false,
        olderThanDays: null,
        keepLastPerKind: null,
        protectNewestWorld: false,
      },
      servers: [{ id: "srv-1", name: "Island" }],
      catalog: catalog({ backups: [failed] }),
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.reason).toBe("failed");
  });

  it("protects the newest completed world backup by default", () => {
    const older = backup({
      id: "w-old",
      kind: "world",
      status: "completed",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
    const newest = backup({
      id: "w-new",
      kind: "world",
      status: "completed",
      completedAt: "2026-01-02T00:00:00.000Z",
    });
    const plan = planBackupCleanup({
      options: {
        serverIds: null,
        includeFailed: false,
        enforceRetention: false,
        olderThanDays: null,
        keepLastPerKind: 1,
        protectNewestWorld: true,
      },
      servers: [{ id: "srv-1", name: "Island" }],
      catalog: catalog({
        backups: [older, newest],
        completedByKind: { world: [newest, older] },
        latestWorld: newest,
      }),
    });
    expect(plan.map((item) => item.backup.id)).toEqual(["w-old"]);
  });

  it("keepLastPerKind retains N archives per player pool", () => {
    const playerA = "76561198000000000";
    const playerB = "76561198000000001";
    const mkPlayer = (id: string, eos: string, stamp: string) =>
      backup({
        id,
        kind: "players",
        status: "completed",
        completedAt: stamp,
        notes: formatPlayerSessionNotes("disconnect", eos, eos),
      });
    const a1 = mkPlayer("a1", playerA, "2026-01-01T00:00:00.000Z");
    const a2 = mkPlayer("a2", playerA, "2026-01-02T00:00:00.000Z");
    const a3 = mkPlayer("a3", playerA, "2026-01-03T00:00:00.000Z");
    const b1 = mkPlayer("b1", playerB, "2026-01-01T00:00:00.000Z");
    const b2 = mkPlayer("b2", playerB, "2026-01-02T00:00:00.000Z");
    const all = [a3, a2, a1, b2, b1];

    const plan = planBackupCleanup({
      options: {
        serverIds: null,
        includeFailed: false,
        enforceRetention: false,
        olderThanDays: null,
        keepLastPerKind: 2,
        protectNewestWorld: false,
      },
      servers: [{ id: "srv-1", name: "Island" }],
      catalog: catalog({
        backups: all,
        completedByKind: { players: all },
      }),
    });

    expect(plan.map((item) => item.backup.id)).toEqual(["a1"]);
    expect(plan[0]?.reason).toContain("keep last 2/players");
  });
});

describe("summarizeCleanupPlan", () => {
  it("aggregates bytes and per-server counts", () => {
    const plan = [
      {
        backup: backup({ id: "a", kind: "world", status: "completed", sizeBytes: 50 }),
        serverName: "Island",
        reason: "failed",
      },
      {
        backup: backup({ id: "b", kind: "ini", status: "completed", sizeBytes: 75 }),
        serverName: "Island",
        reason: "failed",
      },
    ];
    const summary = summarizeCleanupPlan(plan);
    expect(summary.totalBytes).toBe(125);
    expect(summary.byServer).toEqual([
      { serverId: "srv-1", serverName: "Island", count: 2, bytes: 125 },
    ]);
  });
});
