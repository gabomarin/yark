import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifications } from "@mantine/notifications";
import type { RendererApi } from "@shared/ipc";
import { App } from "./App";

function createApiMock(): RendererApi {
  return {
    listServers: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    createServer: vi.fn(),
    updateServer: vi.fn(),
    deleteServer: vi.fn(),
    cloneServer: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    killServer: vi.fn(),
    installServerFiles: vi.fn(),
    updateServerNow: vi.fn(),
    verifyServerFiles: vi.fn(),
    openServerFolder: vi.fn(),
    openServerNativeTerminal: vi.fn(),
    installSteamCmd: vi.fn(),
    cancelSteamCmd: vi.fn(),
    setSteamCmdPath: vi.fn(),
    getSteamCmdStatus: vi.fn().mockResolvedValue({
      ok: true,
      data: {
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
        checkedAt: "2026-07-24T00:00:00.000Z",
      },
    }),
    getSteamCmdConsole: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        lines: [],
        updatedAt: "2026-07-24T00:00:00.000Z",
      },
    }),
    openSteamCmdCache: vi.fn(),
    clearSteamCmdCache: vi.fn(),
    getStatuses: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    getInstallationInfo: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        officialVersion: "358.12",
        officialSteamBuild: "build 24346423",
        servers: [],
      },
    }),
    checkCluster: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    sendRconCommand: vi.fn(),
    recentEvents: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    pickPath: vi.fn(),
    listAppDataFolders: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    openAppDataFolder: vi.fn(),
    getUiDensity: vi.fn().mockResolvedValue({ ok: true, data: "compact" }),
    setUiDensity: vi.fn().mockResolvedValue({ ok: true, data: "compact" }),
    readServerIni: vi.fn(),
    openServerIniInEditor: vi.fn(),
    previewServerIni: vi.fn(),
    saveServerIni: vi.fn(),
    listServerLogs: vi.fn(),
    getServerRuntimeLog: vi.fn(),
    readServerUpdateLog: vi.fn(),
    exportServerLogs: vi.fn(),
    openServerUpdateLogFile: vi.fn(),
    clearServerEvents: vi.fn(),
    clearServerRuntimeLog: vi.fn(),
    deleteServerUpdateLog: vi.fn(),
    clearServerUpdateLogs: vi.fn(),
    listBackups: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    createManualBackup: vi.fn(),
    deleteBackups: vi.fn(),
    restoreBackup: vi.fn(),
    getBackupPolicy: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        serverId: "srv-1",
        enabled: false,
        intervalMinutes: 60,
        retainCountWorld: 20,
        retainCountPlayers: 20,
        retainCountIni: 10,
        backupDir: null,
        updatedAt: "2026-07-24T00:00:00.000Z",
      },
    }),
    setBackupPolicy: vi.fn(),
    resolveBackupRoot: vi.fn().mockResolvedValue({ ok: true, data: "C:/ARK/Backups" }),
    openBackupFolder: vi.fn(),
    openBackupRoot: vi.fn(),
    getBackupFleetSummary: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        servers: [],
        stats: {
          protectedCount: 0,
          atRiskCount: 0,
          failed24h: 0,
          totalBackupBytes: 0,
        },
        disks: [],
        alerts: [],
        diskSettings: {
          warnUsedPercent: 85,
          criticalUsedPercent: 95,
          warnFreeBytes: 20 * 1024 ** 3,
        },
      },
    }),
    getBackupDiskAlertSettings: vi.fn(),
    setBackupDiskAlertSettings: vi.fn(),
    previewBackupCleanup: vi.fn(),
    runBackupCleanup: vi.fn(),
    getModMetadata: vi.fn(),
    getModsMetadata: vi.fn(),
    searchMods: vi.fn(),
    getModByReference: vi.fn(),
    openCurseForgeMod: vi.fn(),
    onServerStatus: vi.fn(() => () => undefined),
    onSteamCmdProgress: vi.fn(() => () => undefined),
    onBackupsChanged: vi.fn(() => () => undefined),
  };
}

describe("App empty installation snapshot", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    const api = createApiMock();
    Object.defineProperty(window, "api", {
      configurable: true,
      value: api,
    });
  });

  it("keeps overview usable and update checks working when there are no servers", async () => {
    const user = userEvent.setup();
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");

    render(
      <App />,
    );

    expect(await screen.findByText("Create your first server")).toBeInTheDocument();
    expect(screen.getByText("358.12")).toBeInTheDocument();

    const api = window.api;
    expect(api.getInstallationInfo).toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    await waitFor(() => {
      expect(api.getInstallationInfo).toHaveBeenCalledWith(true);
    });

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "No updates",
        message: "All installed servers are up to date. Public build: build 24346423",
        color: "teal",
      }),
    );
  });
});

describe("App SteamCMD sync-files UX (#48)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hides 0/0 MB on sync push and skips install snapshot polls while busy", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const idleStatus = {
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
      checkedAt: "2026-07-27T12:00:00.000Z",
    };
    let currentStatus: Record<string, unknown> = { ...idleStatus };
    let progressListener:
      | ((payload: {
          status: Record<string, unknown>;
          console: { lines: string[]; updatedAt: string };
        }) => void)
      | null = null;

    const api = createApiMock();
    api.getSteamCmdStatus = vi.fn().mockImplementation(async () => ({
      ok: true,
      data: currentStatus,
    }));
    api.onSteamCmdProgress = vi.fn((listener) => {
      progressListener = (payload) => {
        currentStatus = payload.status;
        listener(payload);
      };
      return () => {
        progressListener = null;
      };
    });
    Object.defineProperty(window, "api", {
      configurable: true,
      value: api,
    });

    render(
      <App />,
    );

    expect(await screen.findByText("Create your first server")).toBeInTheDocument();
    expect(progressListener).not.toBeNull();

    const now = "2026-07-27T12:00:00.000Z";
    progressListener!({
      status: {
        ...idleStatus,
        busy: true,
        running: true,
        operation: "sync-files",
        progressPercent: null,
        progressLabel: "Copying files to server…",
        progressBytesDownloaded: 0,
        progressBytesTotal: 0,
        lastLine: "Still copying files… (5s elapsed)",
        startedAt: now,
        checkedAt: now,
      },
      console: {
        lines: ["Reusing ASA content cache", "Still copying files… (5s elapsed)"],
        updatedAt: now,
      },
    });

    expect(await screen.findByText(/Copying files to the server/i)).toBeInTheDocument();
    expect(screen.queryByText(/0\.0\s*\/\s*0\.0\s*MB/i)).not.toBeInTheDocument();

    vi.mocked(api.getInstallationInfo).mockClear();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(api.getInstallationInfo).not.toHaveBeenCalled();

    progressListener!({
      status: {
        ...idleStatus,
        busy: false,
        running: false,
        operation: null,
        progressPercent: 100,
        progressLabel: "Completed",
        lastLine: "Operation finished",
        checkedAt: now,
      },
      console: {
        lines: ["ASA cache sync completed (robocopy=1)"],
        updatedAt: now,
      },
    });

    await waitFor(() => {
      expect(screen.queryByText(/Copying files to the server/i)).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.getInstallationInfo).toHaveBeenCalled();
    });
  });
});