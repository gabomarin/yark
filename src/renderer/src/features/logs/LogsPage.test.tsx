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
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "admin",
  clusterId: null,
  clusterDir: null,
  extraArgs: [],
  mods: [],
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

function createApiMock(): RendererApi {
  return {
    listServers: vi.fn(),
    createServer: vi.fn(),
    updateServer: vi.fn(),
    deleteServer: vi.fn(),
    cloneServer: vi.fn(),
    setServerEnabled: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    restartServer: vi.fn(),
    killServer: vi.fn(),
    installServerFiles: vi.fn(),
    updateServerNow: vi.fn(),
    verifyServerFiles: vi.fn(),
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
    recentEvents: vi.fn(),
    pickPath: vi.fn(),
    listAppDataFolders: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    openAppDataFolder: vi.fn(),
    getUiDensity: vi.fn().mockResolvedValue({ ok: true, data: "compact" }),
    setUiDensity: vi.fn().mockResolvedValue({ ok: true, data: "compact" }),
    getDesktopShellPreferences: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        closeWindowToTray: true,
        startWithWindows: false,
        trayCloseHintDismissed: false,
        onQuitWithActiveServers: "ask",
      },
    }),
    setCloseWindowToTray: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setStartWithWindows: vi.fn().mockResolvedValue({ ok: true, data: false }),
    setTrayCloseHintDismissed: vi.fn().mockResolvedValue({ ok: true, data: false }),
    setOnQuitWithActiveServers: vi.fn().mockResolvedValue({ ok: true, data: "ask" }),
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
    listBackups: vi.fn(),
    createManualBackup: vi.fn(),
    deleteBackups: vi.fn(),
    restoreBackup: vi.fn(),
    getBackupPolicy: vi.fn(),
    setBackupPolicy: vi.fn(),
    resolveBackupRoot: vi.fn(),
    openBackupFolder: vi.fn(),
    openBackupRoot: vi.fn(),
    getBackupFleetSummary: vi.fn(),
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
    onBackupsChanged: vi.fn(() => () => undefined),
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
});
