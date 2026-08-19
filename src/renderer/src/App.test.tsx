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
    probeImportInstall: vi.fn(),
    importExistingServer: vi.fn(),
    updateServer: vi.fn(),
    updateServerPatch: vi.fn(),
    setServerEnabled: vi.fn(),
    deleteServer: vi.fn(),
    cloneServer: vi.fn(),
    cloneServerWithParams: vi.fn(),
    cancelCloneServerCopy: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    restartServer: vi.fn(),
    killServer: vi.fn(),
    installServerFiles: vi.fn(),
    updateServerNow: vi.fn(),
    verifyServerFiles: vi.fn(),
    moveServerInstall: vi.fn(),
    cancelMoveServerInstall: vi.fn(),
    cleanupMovedServerInstall: vi.fn(),
    dismissMoveServerInstallCleanup: vi.fn(),
    openServerFolder: vi.fn(),
    openServerNativeTerminal: vi.fn(),
    installSteamCmd: vi.fn(),
    cancelSteamCmd: vi.fn(),
    pauseSteamCmd: vi.fn(),
    retryCriticalJob: vi.fn(),
    dismissCriticalJob: vi.fn(),
    cancelCriticalJob: vi.fn(),
    resumeCriticalJob: vi.fn(),
    reorderCriticalJob: vi.fn(),
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
        criticalJobs: [],
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
        officialNetworkStatus: "online",
        officialSteamBuild: "build 24346423",
        servers: [],
      },
    }),
    checkCluster: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    sendRconCommand: vi.fn(),
    retryRconConnection: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getRconStatus: vi.fn().mockResolvedValue({ ok: true, data: { serverId: "", status: "disconnected", lastError: null } }),
    getAllRconStatus: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    notifyRconTabFocus: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    refreshPlayerList: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    kickPlayer: vi.fn().mockResolvedValue({ ok: true, data: "" }),
    banPlayer: vi.fn().mockResolvedValue({ ok: true, data: "" }),
    listBannedPlayers: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    openBanListFile: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    unbanPlayer: vi.fn().mockResolvedValue({
      ok: true,
      data: { banned: [], warning: null },
    }),
    recentEvents: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    pickPath: vi.fn(),
    pickFolder: vi.fn(),
    listAppDataFolders: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    openAppDataFolder: vi.fn(),
    getUiDensity: vi.fn().mockResolvedValue({ ok: true, data: "compact" }),
    setUiDensity: vi.fn().mockResolvedValue({ ok: true, data: "compact" }),
    getOpenNativeConsole: vi.fn().mockResolvedValue({ ok: true, data: false }),
    setOpenNativeConsole: vi.fn().mockResolvedValue({ ok: true, data: false }),
    getLastSeenChangelogVersion: vi.fn().mockResolvedValue({
      ok: true,
      data: "0.11.0",
    }),
    setLastSeenChangelogVersion: vi.fn().mockResolvedValue({
      ok: true,
      data: "0.11.0",
    }),
    getOnboarding: vi.fn().mockResolvedValue({
      ok: true,
      data: { status: "completed", completedAt: "2026-01-01T00:00:00.000Z" },
    }),
    setOnboarding: vi.fn().mockResolvedValue({
      ok: true,
      data: { status: "completed", completedAt: "2026-01-01T00:00:00.000Z" },
    }),
    getDesktopShellPreferences: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        closeWindowToTray: true,
        startWithWindows: false,
        trayCloseHintDismissed: false,
      },
    }),
    setCloseWindowToTray: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setStartWithWindows: vi.fn().mockResolvedValue({ ok: true, data: false }),
    setTrayCloseHintDismissed: vi.fn().mockResolvedValue({ ok: true, data: false }),
    readServerIni: vi.fn(),
    openServerIniInEditor: vi.fn(),
    previewServerIni: vi.fn(),
    saveServerIni: vi.fn(),
    getClusterIniTemplate: vi.fn(async () => ({ ok: true as const, data: null })),
    getClusterIniTemplateOrDraft: vi.fn(),
    previewClusterIniTemplate: vi.fn(),
    saveClusterIniTemplate: vi.fn(),
    deleteClusterIniTemplate: vi.fn(),
    previewClusterIniRestore: vi.fn(),
    previewClusterIniPromote: vi.fn(),
    previewClusterIniSeed: vi.fn(),
    restoreClusterIniFromTemplate: vi.fn(),
    promoteClusterIniToTemplate: vi.fn(),
    seedClusterIniFromTemplate: vi.fn(),
    describeConfigTransferSource: vi.fn(),
    previewConfigTransfer: vi.fn(),
    commitConfigTransfer: vi.fn(),
    listServerLogs: vi.fn(),
    getServerRuntimeLog: vi.fn(),
    readServerUpdateLog: vi.fn(),
    exportServerLogs: vi.fn(),
    openServerUpdateLogFile: vi.fn(),
    clearServerEvents: vi.fn(),
    clearServerRuntimeLog: vi.fn(),
    deleteServerUpdateLog: vi.fn(),
    clearServerUpdateLogs: vi.fn(),
    getLogRetentionSettings: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        eventsRetainDays: 90,
        eventsFailureRetainDays: 180,
        updateLogsRetainCount: 20,
        updateLogsFailureRetainDays: 180,
        autoCleanupEnabled: true,
      },
    }),
    setLogRetentionSettings: vi.fn(),
    previewLogCleanup: vi.fn(),
    runLogCleanup: vi.fn(),
    listBackups: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    createManualBackup: vi.fn(),
    deleteBackups: vi.fn(),
    deleteFailedBackups: vi.fn(),
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
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
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
    dismissBackupFleetAlert: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
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
    onServerStopProgress: vi.fn(() => () => undefined),
    onMoveInstallProgress: vi.fn(() => () => undefined),
    onCloneInstallProgress: vi.fn(() => () => undefined),
    onBackupsChanged: vi.fn(() => () => undefined),
    onRconStatusChanged: vi.fn(() => () => undefined),
    onPlayerListUpdated: vi.fn(() => () => undefined),
    getAppUpdateStatus: vi.fn(async () => ({
      ok: true as const,
      data: {
        phase: "idle" as const,
        currentVersion: "0.1.0",
        availableVersion: null,
        percent: null,
        error: null,
        isPackaged: false,
        releasePageUrl: "https://github.com/gabomarin/yark/releases",
        releaseNotesUrl: null,
        installBlockedReason: "dev" as const,
        installBlockedMessage: "Install is only available in the packaged Windows app.",
      },
    })),
    checkForAppUpdate: vi.fn(async () => ({
      ok: true as const,
      data: {
        phase: "up-to-date" as const,
        currentVersion: "0.1.0",
        availableVersion: null,
        percent: null,
        error: null,
        isPackaged: false,
        releasePageUrl: "https://github.com/gabomarin/yark/releases",
        releaseNotesUrl: null,
        installBlockedReason: "dev" as const,
        installBlockedMessage: "Install is only available in the packaged Windows app.",
      },
    })),
    downloadAppUpdate: vi.fn(async () => ({
      ok: false as const,
      error: "not packaged",
    })),
    installAppUpdate: vi.fn(async () => ({
      ok: false as const,
      error: "not packaged",
    })),
    openYarkReleaseNotes: vi.fn(async () => ({ ok: true as const, data: undefined })),
    onAppUpdate: vi.fn(() => () => undefined),
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
    expect(api.getInstallationInfo).toHaveBeenCalledWith(false, true);

    await user.click(screen.getByRole("button", { name: "Check server updates" }));

    await waitFor(() => {
      expect(api.getInstallationInfo).toHaveBeenCalledWith(true);
    });

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "You're up to date",
        message: "All installed servers are on the latest version.",
        color: "teal",
      }),
    );
  });

  it("auto-opens the first-run setup wizard when onboarding is unset", async () => {
    const user = userEvent.setup();
    const api = window.api;
    vi.mocked(api.getOnboarding).mockResolvedValue({ ok: true, data: null });

    render(<App />);

    expect(await screen.findByRole("dialog", { name: /set up yark/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip setup/i }));
    await waitFor(() => {
      expect(api.setOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({ status: "skipped" }),
      );
    });
    expect(await screen.findByText("Create your first server")).toBeInTheDocument();
  });

  it("keeps setup open when onboarding persistence fails", async () => {
    const user = userEvent.setup();
    const api = window.api;
    vi.mocked(api.getOnboarding).mockResolvedValue({ ok: true, data: null });
    vi.mocked(api.setOnboarding).mockResolvedValue({
      ok: false,
      error: "database unavailable",
    });

    render(<App />);

    const dialog = await screen.findByRole("dialog", { name: /set up yark/i });
    await user.click(screen.getByRole("button", { name: /skip setup/i }));

    await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledTimes(1));
    expect(dialog).toBeInTheDocument();
  });

  it("does not auto-open setup when onboarding read fails", async () => {
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    const api = window.api;
    vi.mocked(api.getOnboarding).mockResolvedValue({
      ok: false,
      error: "database unavailable",
    });

    render(<App />);

    expect(await screen.findByText("Create your first server")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /set up yark/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "onboarding-load-failed",
          title: "Could not load setup status",
          message: expect.stringContaining("database unavailable"),
          color: "red",
          autoClose: false,
        }),
      );
    });
  });

  it("retries onboarding read from the error toast and opens setup when unset", async () => {
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    const api = window.api;
    vi.mocked(api.getOnboarding).mockResolvedValue({
      ok: false,
      error: "database unavailable",
    });

    render(<App />);

    expect(await screen.findByText("Create your first server")).toBeInTheDocument();
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: "onboarding-load-failed" }),
      );
    });

    vi.mocked(api.getOnboarding).mockResolvedValue({ ok: true, data: null });
    const toast = notifySpy.mock.calls.find(
      (call) => call[0]?.id === "onboarding-load-failed",
    )?.[0];
    expect(toast?.onClick).toEqual(expect.any(Function));
    toast?.onClick?.({} as never);

    expect(await screen.findByRole("dialog", { name: /set up yark/i })).toBeInTheDocument();
  });

  it("restores a pending setup cluster for the next create handoff", async () => {
    const user = userEvent.setup();
    const api = window.api;
    vi.mocked(api.getOnboarding).mockResolvedValue({
      ok: true,
      data: {
        status: "completed",
        completedAt: "2026-08-14T12:00:00.000Z",
        pendingCluster: {
          clusterId: "ember",
          clusterDir: "D:\\ASA\\Clusters\\Ember",
        },
      },
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "New server" }));
    expect(await screen.findByRole("combobox", { name: /^cluster$/i })).toHaveValue(
      "ember · from setup",
    );
    expect(screen.getByLabelText(/^cluster id$/i)).toHaveValue("ember");
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
      criticalJobs: [],
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

    expect(await screen.findByText(/Copying files to server/i)).toBeInTheDocument();
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
