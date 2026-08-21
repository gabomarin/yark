import { vi } from "vitest";
import type { AppUpdateStatus } from "@shared/app-update";
import type { RendererApi } from "@shared/ipc";

/** Stable ISO timestamp for fixture payloads — bump when suites assert on age. */
const TEST_NOW = "2026-07-24T00:00:00.000Z";

/** Onboarding `completedAt` fixture (distinct from TEST_NOW for clarity). */
const TEST_ONBOARDING_AT = "2026-01-01T00:00:00.000Z";

/** Packaged-app version string used by update-status stubs. */
const TEST_APP_VERSION = "0.1.0";

/** Last-seen What's new version for prefs stubs. */
const TEST_CHANGELOG_VERSION = "0.11.0";

/** Official ASA build string shown on Overview when mounting App. */
export const TEST_OFFICIAL_VERSION = "358.12";

const idleAppUpdateStatus: AppUpdateStatus = {
  phase: "idle",
  currentVersion: TEST_APP_VERSION,
  availableVersion: null,
  percent: null,
  error: null,
  isPackaged: false,
  releasePageUrl: "https://github.com/gabomarin/yark/releases",
  releaseNotesUrl: null,
  installBlockedReason: "dev",
  installBlockedMessage: "Install is only available in the packaged Windows app.",
};

const upToDateAppUpdateStatus: AppUpdateStatus = {
  ...idleAppUpdateStatus,
  phase: "up-to-date",
};

/**
 * Full `RendererApi` stub for Vitest renderer suites.
 * Override only the methods a test cares about; new IPC methods land here once.
 *
 * Prefer this whenever a suite types `window.api` as a complete `RendererApi`
 * (or grows toward that). Partial stubs / `as unknown as RendererApi` are fine
 * until they force mechanical edits on every IPC addition — then migrate.
 * See docs/agent-context.md (renderer test helpers).
 *
 * Methods without an explicit `mockResolvedValue` stay bare `vi.fn()` and
 * resolve to `undefined` if awaited — matching the historical App/Logs mocks.
 * Override when a test asserts a real `IpcResult` shape.
 */
export function createRendererApiMock(
  overrides: Partial<RendererApi> = {},
): RendererApi {
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
    enqueueUpdateServer: vi.fn(),
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
        checkedAt: TEST_NOW,
      },
    }),
    getSteamCmdConsole: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        lines: [],
        updatedAt: TEST_NOW,
      },
    }),
    openSteamCmdCache: vi.fn(),
    clearSteamCmdCache: vi.fn(),
    getStatuses: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    getInstallationInfo: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        officialVersion: TEST_OFFICIAL_VERSION,
        officialNetworkStatus: "online",
        officialSteamBuild: "build 24346423",
        servers: [],
      },
    }),
    checkCluster: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    sendRconCommand: vi.fn(),
    retryRconConnection: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getRconStatus: vi.fn().mockResolvedValue({
      ok: true,
      data: { serverId: "", status: "disconnected", lastError: null },
    }),
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
      data: TEST_CHANGELOG_VERSION,
    }),
    setLastSeenChangelogVersion: vi.fn().mockResolvedValue({
      ok: true,
      data: TEST_CHANGELOG_VERSION,
    }),
    getOnboarding: vi.fn().mockResolvedValue({
      ok: true,
      data: { status: "completed", completedAt: TEST_ONBOARDING_AT },
    }),
    setOnboarding: vi.fn().mockResolvedValue({
      ok: true,
      data: { status: "completed", completedAt: TEST_ONBOARDING_AT },
    }),
    getDesktopShellPreferences: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        closeWindowToTray: true,
        startWithWindows: false,
        trayCloseHintDismissed: false,
        osNotifyEnabled: true,
        osNotifyCrash: true,
        osNotifySteamCmd: true,
        osNotifyYarkUpdate: true,
      },
    }),
    setCloseWindowToTray: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setStartWithWindows: vi.fn().mockResolvedValue({ ok: true, data: false }),
    setTrayCloseHintDismissed: vi.fn().mockResolvedValue({ ok: true, data: false }),
    setOsNotifyEnabled: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setOsNotifyCrash: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setOsNotifySteamCmd: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setOsNotifyYarkUpdate: vi.fn().mockResolvedValue({ ok: true, data: true }),
    readServerIni: vi.fn(),
    openServerIniInEditor: vi.fn(),
    previewServerIni: vi.fn(),
    saveServerIni: vi.fn(),
    getClusterIniTemplate: vi.fn().mockResolvedValue({ ok: true, data: null }),
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
        updatedAt: TEST_NOW,
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
    listModCategories: vi.fn().mockResolvedValue({ ok: true, data: [] }),
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
    getAppUpdateStatus: vi.fn().mockResolvedValue({
      ok: true,
      data: idleAppUpdateStatus,
    }),
    checkForAppUpdate: vi.fn().mockResolvedValue({
      ok: true,
      data: upToDateAppUpdateStatus,
    }),
    downloadAppUpdate: vi.fn().mockResolvedValue({
      ok: false,
      error: "not packaged",
    }),
    installAppUpdate: vi.fn().mockResolvedValue({
      ok: false,
      error: "not packaged",
    }),
    openYarkReleaseNotes: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    onAppUpdate: vi.fn(() => () => undefined),
    onOsNotificationOpen: vi.fn(() => () => undefined),
    ...overrides,
  };
}
