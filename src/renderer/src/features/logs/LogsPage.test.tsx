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
    getModMetadata: vi.fn(),
    getModsMetadata: vi.fn(),
    onServerStatus: vi.fn(() => () => undefined),
    onSteamCmdProgress: vi.fn(() => () => undefined),
  };
}

describe("LogsPage", () => {
  afterEach(() => {
    cleanup();
  });

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
        backups: [
          {
            id: "backup-1",
            serverId: server.id,
            type: "manual",
            path: "C:/ARK/Backups/backup-1.zip",
            sizeBytes: 2048,
            status: "completed",
            createdAt: "2026-07-23T09:00:00.000Z",
            completedAt: "2026-07-23T09:01:00.000Z",
            notes: null,
          },
        ],
        events: [
          {
            id: 1,
            serverId: server.id,
            type: "update_completed",
            severity: "info",
            message: "Update completed",
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
    expect(await screen.findByText("Update history")).toBeInTheDocument();
    expect(await screen.findByText(/Update successful/i)).toBeInTheDocument();
    expect(screen.getByText("srv-1-2026-07-23.log")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open in external viewer/i })).toBeInTheDocument();
    expect(screen.queryByText("Server")).not.toBeInTheDocument();
  });

  it("keeps each log collection in its own viewport scroll region", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <LogsPage
          servers={[server]}
          selectedServerId={server.id}
          onSelectedServerChange={vi.fn()}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Update completed")).toBeInTheDocument();
    expect(document.querySelector('[data-fill-viewport="true"]')).toBeInTheDocument();
    expect(document.querySelector('[data-logs-scroll-region="events"]')).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Runtime" }));
    expect(await screen.findByText("Server booted")).toBeInTheDocument();
    expect(document.querySelector('[data-logs-scroll-region="runtime"]')).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Updates" }));
    expect(await screen.findByText(/Update successful/i)).toBeInTheDocument();
    expect(document.querySelector('[data-logs-scroll-region="updates-list"]')).toBeInTheDocument();
    expect(document.querySelector('[data-logs-scroll-region="update-content"]')).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Backups" }));
    expect(await screen.findByText("C:/ARK/Backups/backup-1.zip")).toBeInTheDocument();
    expect(document.querySelector('[data-logs-scroll-region="backups"]')).toBeInTheDocument();
  });
});
