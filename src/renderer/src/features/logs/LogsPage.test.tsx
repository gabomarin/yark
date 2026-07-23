import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
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
    startServer: vi.fn(),
    stopServer: vi.fn(),
    killServer: vi.fn(),
    installServerFiles: vi.fn(),
    updateServerNow: vi.fn(),
    openServerFolder: vi.fn(),
    openServerNativeTerminal: vi.fn(),
    installSteamCmd: vi.fn(),
    cancelSteamCmd: vi.fn(),
    setSteamCmdPath: vi.fn(),
    getSteamCmdStatus: vi.fn(),
    getSteamCmdConsole: vi.fn(),
    getStatuses: vi.fn(),
    getInstallationInfo: vi.fn(),
    checkCluster: vi.fn(),
    sendRconCommand: vi.fn(),
    recentEvents: vi.fn(),
    pickPath: vi.fn(),
    readServerIni: vi.fn(),
    openServerIniInEditor: vi.fn(),
    previewServerIni: vi.fn(),
    saveServerIni: vi.fn(),
    listServerLogs: vi.fn(),
    readServerUpdateLog: vi.fn(),
    exportServerLogs: vi.fn(),
    openServerUpdateLogFile: vi.fn(),
    onServerStatus: vi.fn(() => () => undefined),
  };
}

describe("LogsPage", () => {
  beforeEach(() => {
    const api = createApiMock();
    api.listServerLogs = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        serverId: server.id,
        updateFiles: [
          {
            fileName: "srv-1-2026-07-23.log",
            fullPath: "C:/logs/srv-1-2026-07-23.log",
            modifiedAt: "2026-07-23T10:00:00.000Z",
            sizeBytes: 1024,
            status: "success",
            exitCode: 0,
            durationMs: 42000,
          },
        ],
        backups: [],
        events: [
          {
            id: 1,
            serverId: server.id,
            type: "update_completed",
            severity: "info",
            message: "Update completado",
            createdAt: "2026-07-23T10:01:00.000Z",
          },
        ],
        runtimeLogLines: ["Server booted"],
      },
    });
    api.readServerUpdateLog = vi.fn().mockResolvedValue({
      ok: true,
      data: "time=2026-07-23T10:00:00.000Z\nexitCode=0\n--- stdout ---\nUpdate successful",
    });
    api.exportServerLogs = vi.fn().mockResolvedValue({ ok: true, data: null });
    api.openServerUpdateLogFile = vi.fn().mockResolvedValue({ ok: true, data: undefined });

    Object.defineProperty(window, "api", {
      configurable: true,
      value: api,
    });
  });

  it("loads historical logs for the selected server and shows the first update log", async () => {
    render(
      <AppProviders>
        <LogsPage
          servers={[server]}
          selectedServerId={server.id}
          onSelectedServerChange={vi.fn()}
          initialSection="updates"
        />
      </AppProviders>,
    );

    expect(screen.getByText("Logs")).toBeInTheDocument();
    expect(await screen.findByText("Update History")).toBeInTheDocument();
    expect(await screen.findByText(/Update successful/i)).toBeInTheDocument();
    expect(screen.getAllByText("The Island").length).toBeGreaterThan(0);
  });
});