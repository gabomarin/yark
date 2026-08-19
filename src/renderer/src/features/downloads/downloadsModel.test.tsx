import { describe, expect, it } from "vitest";
import type { ServerProfile, SteamCmdStatus } from "@shared/types";
import {
  buildDownloadRows,
  buildDownloadsTeaser,
  defaultSelectedRowId,
  downloadsBadgeCount,
  filesQueueStateByServerId,
} from "./downloadsModel";
import { downloadRowMeta, formatDownloadPhase } from "./downloadsCopy";

function baseStatus(overrides: Partial<SteamCmdStatus> = {}): SteamCmdStatus {
  return {
    detected: true,
    executablePath: "C:/steamcmd/steamcmd.exe",
    depotCacheDir: "C:/steamcmd/steamapps/depotcache",
    contentCacheDir: "C:/steamcmd/asa_content_cache",
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
    checkedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

function server(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-1",
    name: "Island",
    map: "TheIsland",
    mapModId: null,
    mapSaveFolder: null,
    installDir: "C:/ARK/Island",
    enabled: true,
    autoStart: false,
    sessionName: "Island",
    maxPlayers: 70,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "test1234",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    updatedAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("downloadsModel", () => {
  it("builds active and queued rows from status", () => {
    const rows = buildDownloadRows(
      baseStatus({
        busy: true,
        running: true,
        operation: "update",
        serverId: "srv-1",
        progressPercent: 38,
        progressBytesDownloaded: 1_200_000_000,
        progressBytesTotal: 4_800_000_000,
        progressLabel: "Downloading",
        criticalJobs: [
          {
            id: "job-active",
            operation: "update",
            serverId: "srv-1",
            serverName: "Island",
            status: "running",
            phase: "downloading",
            attempts: 1,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            lastError: null,
            recoveryReason: null,
            nextActions: [],
          },
          {
            id: "job-queued",
            operation: "install-files",
            serverId: "srv-2",
            serverName: "Center",
            status: "pending",
            phase: "queued",
            attempts: 0,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:01.000Z",
            updatedAt: "2026-08-18T00:00:01.000Z",
            lastError: null,
            recoveryReason: null,
            nextActions: ["cancel"],
          },
        ],
      }),
      { activeServer: server() },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.kind).toBe("active");
    expect(rows[0]?.id).toBe("job-active");
    expect(rows[0]?.percent).toBe(38);
    expect(rows[1]?.kind).toBe("queued");
    expect(rows[1]?.reorderable).toBe(true);
    expect(rows[1]?.canMoveDown).toBe(false);
  });

  it("marks queued file jobs as reorderable with move bounds", () => {
    const rows = buildDownloadRows(
      baseStatus({
        criticalJobs: [
          {
            id: "a",
            operation: "update",
            serverId: "s1",
            status: "pending",
            phase: "queued",
            attempts: 0,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            lastError: null,
            recoveryReason: null,
            nextActions: ["cancel"],
          },
          {
            id: "b",
            operation: "install-files",
            serverId: "s2",
            status: "pending",
            phase: "queued",
            attempts: 0,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:01.000Z",
            updatedAt: "2026-08-18T00:00:01.000Z",
            lastError: null,
            recoveryReason: null,
            nextActions: ["cancel"],
          },
        ],
      }),
    );

    expect(rows[0]?.canMoveUp).toBe(false);
    expect(rows[0]?.canMoveDown).toBe(true);
    expect(rows[1]?.canMoveUp).toBe(true);
    expect(rows[1]?.canMoveDown).toBe(false);
  });

  it("does not mark backup jobs as reorderable", () => {
    const rows = buildDownloadRows(
      baseStatus({
        criticalJobs: [
          {
            id: "backup",
            operation: "pre-update-backup",
            serverId: "s1",
            status: "pending",
            phase: "queued",
            attempts: 0,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            lastError: null,
            recoveryReason: null,
            nextActions: ["cancel"],
          },
        ],
      }),
    );

    expect(rows[0]?.reorderable).toBe(false);
  });

  it("builds teaser copy for active work", () => {
    const rows = buildDownloadRows(
      baseStatus({
        busy: true,
        running: true,
        operation: "update",
        serverId: "srv-1",
        progressPercent: 42,
        progressBytesDownloaded: 1,
        progressBytesTotal: 10,
        criticalJobs: [
          {
            id: "job-active",
            operation: "update",
            serverId: "srv-1",
            serverName: "Island",
            status: "running",
            phase: "downloading",
            attempts: 1,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            lastError: null,
            recoveryReason: null,
            nextActions: [],
          },
          {
            id: "job-queued",
            operation: "install-files",
            serverId: "srv-2",
            status: "pending",
            phase: "queued",
            attempts: 0,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:01.000Z",
            updatedAt: "2026-08-18T00:00:01.000Z",
            lastError: null,
            recoveryReason: null,
            nextActions: ["cancel"],
          },
        ],
      }),
      { activeServer: server() },
    );
    const teaser = buildDownloadsTeaser(
      baseStatus({
        busy: true,
        running: true,
        operation: "update",
        serverId: "srv-1",
        progressPercent: 42,
        progressBytesDownloaded: 1,
        progressBytesTotal: 10,
      }),
      rows,
    );

    expect(teaser.visible).toBe(true);
    expect(teaser.title).toBe("Island");
    expect(teaser.detail).toContain("1 queued");
    expect(teaser.percent).toBe(42);
    expect(teaser.canPause).toBe(true);
    expect(downloadsBadgeCount(rows)).toBe(2);
    expect(defaultSelectedRowId(rows)).toBe(rows[0]?.id ?? null);
  });

  it("keeps paused jobs resumable and separate from queued work", () => {
    const rows = buildDownloadRows(
      baseStatus({
        criticalJobs: [
          {
            id: "job-paused",
            operation: "update",
            serverId: "srv-1",
            serverName: "Island",
            status: "paused",
            phase: "applying-files",
            attempts: 1,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            lastError: null,
            recoveryReason: "Paused by the operator. Resume to continue.",
            nextActions: ["resume", "cancel"],
          },
        ],
      }),
      { activeServer: server() },
    );
    const teaser = buildDownloadsTeaser(baseStatus(), rows);

    expect(rows[0]?.kind).toBe("paused");
    expect(rows[0]?.phase).toBe("Paused");
    expect(teaser.canResume).toBe(true);
    expect(teaser.usesLiveCancel).toBe(false);
    expect(defaultSelectedRowId(rows)).toBe("job-paused");
  });

  it("offers Retry on cancelled leftovers in the teaser and attention row", () => {
    const rows = buildDownloadRows(
      baseStatus({
        criticalJobs: [
          {
            id: "job-cancelled",
            operation: "verify-files",
            serverId: "srv-1",
            serverName: "Island",
            status: "cancelled",
            phase: "cancelled",
            attempts: 1,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            lastError: null,
            recoveryReason: "Cancelled by the operator during execution.",
            nextActions: ["retry", "dismiss"],
          },
        ],
      }),
      { activeServer: server() },
    );
    const teaser = buildDownloadsTeaser(baseStatus(), rows);

    expect(rows[0]?.kind).toBe("attention");
    expect(rows[0]?.phase).toBe("Cancelled");
    expect(teaser.canRetry).toBe(true);
    expect(teaser.attention).toBe(true);
    expect(teaser.selectedJobId).toBe("job-cancelled");
  });

  it("does not offer Pause for verify because SteamCMD validate has no checkpoint", () => {
    const rows = buildDownloadRows(
      baseStatus({
        busy: true,
        running: true,
        operation: "verify-files",
        serverId: "srv-1",
        progressPercent: 38,
        criticalJobs: [
          {
            id: "job-verify",
            operation: "verify-files",
            serverId: "srv-1",
            serverName: "Island",
            status: "running",
            phase: "applying-files",
            attempts: 1,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            lastError: null,
            recoveryReason: null,
            nextActions: [],
          },
        ],
      }),
      { activeServer: server() },
    );
    const teaser = buildDownloadsTeaser(
      baseStatus({
        busy: true,
        running: true,
        operation: "verify-files",
        serverId: "srv-1",
        progressPercent: 38,
      }),
      rows,
    );

    expect(rows[0]?.canPause).toBe(false);
    expect(teaser.canPause).toBe(false);
    expect(teaser.usesLiveCancel).toBe(true);
  });

  it("hides Pause while an update is rolling back", () => {
    const rows = buildDownloadRows(
      baseStatus({
        busy: true,
        running: true,
        operation: "update",
        serverId: "srv-1",
        criticalJobs: [
          {
            id: "job-rollback",
            operation: "update",
            serverId: "srv-1",
            serverName: "Island",
            status: "running",
            phase: "rollback-restoring-backups",
            attempts: 1,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            lastError: null,
            recoveryReason: null,
            nextActions: [],
          },
        ],
      }),
      { activeServer: server() },
    );

    expect(rows[0]?.canPause).toBe(false);
  });

  it("prefers the active job when a server also has queued work", () => {
    const map = filesQueueStateByServerId([
      {
        id: "queued",
        operation: "verify-files",
        serverId: "srv-2",
        serverName: "Center",
        status: "pending",
        phase: "queued",
        attempts: 0,
        maxAttempts: 3,
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
        lastError: null,
        recoveryReason: null,
        nextActions: ["cancel"],
      },
      {
        id: "active",
        operation: "update",
        serverId: "srv-1",
        serverName: "Island",
        status: "running",
        phase: "downloading",
        attempts: 1,
        maxAttempts: 3,
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
        lastError: null,
        recoveryReason: null,
        nextActions: [],
      },
    ]);

    expect(map.get("srv-2")?.kind).toBe("queued");
    expect(map.get("srv-2")?.label).toMatch(/Queued/i);
    expect(map.get("srv-1")?.kind).toBe("active");
  });

  it("labels a paused install for Overview cards after SteamCMD is no longer live", () => {
    const map = filesQueueStateByServerId([
      {
        id: "paused-install",
        operation: "install-files",
        serverId: "srv-3",
        serverName: "Ragnarok",
        status: "paused",
        phase: "applying-files",
        attempts: 1,
        maxAttempts: 3,
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
        lastError: null,
        recoveryReason: "Paused by the operator. Resume to continue.",
        nextActions: ["resume", "cancel"],
      },
    ]);

    expect(map.get("srv-3")).toMatchObject({
      kind: "paused",
      label: "Paused · Installing files",
      operation: "install-files",
    });
  });

  it("humanizes leftover phases and omits duplicate cancelled copy", () => {
    expect(formatDownloadPhase("applying-files")).toBe("Applying files");
    expect(formatDownloadPhase("rollback-complete")).toBe("Rollback complete");
    expect(
      downloadRowMeta({
        subtitle: "Updating server",
        phase: "Queued",
        statusLabel: "blocked",
        byteProgress: null,
        byteProgressNoun: null,
      }),
    ).toBe("Updating server");
  });

  it("hints attention leftovers on a paused teaser", () => {
    const rows = buildDownloadRows(
      baseStatus({
        criticalJobs: [
          {
            id: "job-paused",
            operation: "install-files",
            serverId: "srv-1",
            serverName: "Island",
            status: "paused",
            phase: "applying-files",
            attempts: 1,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            lastError: null,
            recoveryReason: "Paused by the operator. Resume to continue.",
            nextActions: ["resume", "cancel"],
          },
          {
            id: "job-cancelled",
            operation: "verify-files",
            serverId: "srv-2",
            serverName: "Aberration",
            status: "cancelled",
            phase: "cancelled",
            attempts: 1,
            maxAttempts: 3,
            createdAt: "2026-08-18T00:00:01.000Z",
            updatedAt: "2026-08-18T00:00:01.000Z",
            lastError: null,
            recoveryReason: "Cancelled by the operator during execution.",
            nextActions: ["retry", "dismiss"],
          },
        ],
      }),
    );
    const teaser = buildDownloadsTeaser(baseStatus(), rows);

    expect(teaser.canResume).toBe(true);
    expect(teaser.attention).toBe(true);
    expect(teaser.detail).toContain("1 need review");

    const missing = buildDownloadsTeaser(baseStatus({ detected: false, executablePath: null }), rows);
    expect(missing.canResume).toBe(false);
    expect(missing.canCancel).toBe(false);
    expect(missing.attention).toBe(true);
  });
});
