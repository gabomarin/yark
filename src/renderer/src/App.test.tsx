import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifications } from "@mantine/notifications";
import type { RendererApi } from "@shared/ipc";
import { App } from "./App";
import { AppProviders } from "@app/AppProviders";

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
    readServerIni: vi.fn(),
    openServerIniInEditor: vi.fn(),
    previewServerIni: vi.fn(),
    saveServerIni: vi.fn(),
    listServerLogs: vi.fn(),
    readServerUpdateLog: vi.fn(),
    exportServerLogs: vi.fn(),
    openServerUpdateLogFile: vi.fn(),
    getModMetadata: vi.fn(),
    getModsMetadata: vi.fn(),
    onServerStatus: vi.fn(() => () => undefined),
    onSteamCmdProgress: vi.fn(() => () => undefined),
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
      <AppProviders>
        <App />
      </AppProviders>,
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