import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { LogsPage } from "./LogsPage";
import type { RendererApi } from "@shared/ipc";

const server = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  sessionName: "The Island Cluster",
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
  enabled: true,
  autoStart: false,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

function createApiMock(): RendererApi {
  return {
    listServers: vi.fn(),
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
    retryCriticalJob: vi.fn(),
    dismissCriticalJob: vi.fn(),
    cancelCriticalJob: vi.fn(),
    setSteamCmdPath: vi.fn(),
    getSteamCmdStatus: vi.fn(),
    getSteamCmdConsole: vi.fn(),
    openSteamCmdCache: vi.fn(),
    clearSteamCmdCache: vi.fn(),
    getStatuses: vi.fn(),
    getInstallationInfo: vi.fn(),
    checkCluster: vi.fn(),
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
    recentEvents: vi.fn(),
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
    listBackups: vi.fn(),
    createManualBackup: vi.fn(),
    deleteBackups: vi.fn(),
    deleteFailedBackups: vi.fn(),
    restoreBackup: vi.fn(),
    getBackupPolicy: vi.fn(),
    setBackupPolicy: vi.fn(),
    resolveBackupRoot: vi.fn(),
    openBackupFolder: vi.fn(),
    openBackupRoot: vi.fn(),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
    getBackupFleetSummary: vi.fn(),
    dismissBackupFleetAlert: vi.fn(),
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

describe("LogsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    const api = createApiMock();
    api.recentEvents = vi.fn().mockResolvedValue({
      ok: true,
      data: [
        {
          id: 99,
          serverId: server.id,
          type: "update_failed",
          severity: "error",
          message: "Update failed on Island",
          createdAt: new Date().toISOString(),
          details: null,
        },
      ],
    });

    Object.defineProperty(window, "api", {
      configurable: true,
      value: api,
    });
  });

  it("shows problems across servers and opens the matching server logs focus", async () => {
    const onOpenServerLogs = vi.fn();
    const user = userEvent.setup();
    render(
      <AppProviders>
        <LogsPage servers={[server]} onOpenServerLogs={onOpenServerLogs} />
      </AppProviders>,
    );

    expect(await screen.findByText("Activity across servers")).toBeInTheDocument();
    expect(await screen.findByText(/Update failed on Island/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Update failed on Island/i }));
    expect(
      await screen.findByText(/A SteamCMD install, update, or verify job failed/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Open in server/i }));
    expect(onOpenServerLogs).toHaveBeenCalledWith(
      server.id,
      expect.objectContaining({
        section: "events",
        eventId: 99,
      }),
    );
  });

  it("labels activity from a disabled server as inactive", async () => {
    render(
      <AppProviders>
        <LogsPage
          servers={[{ ...server, enabled: false }]}
          onOpenServerLogs={vi.fn()}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });

  it("does not reload fleet events when servers prop identity changes", async () => {
    const recentEvents = vi.mocked(window.api.recentEvents);
    const { rerender } = render(
      <AppProviders>
        <LogsPage servers={[server]} onOpenServerLogs={vi.fn()} />
      </AppProviders>,
    );

    expect(await screen.findByText(/Update failed on Island/i)).toBeInTheDocument();
    expect(recentEvents).toHaveBeenCalledTimes(1);

    rerender(
      <AppProviders>
        <LogsPage
          servers={[{ ...server }]}
          onOpenServerLogs={vi.fn()}
        />
      </AppProviders>,
    );

    await screen.findByText(/Update failed on Island/i);
    expect(recentEvents).toHaveBeenCalledTimes(1);
  });
});
