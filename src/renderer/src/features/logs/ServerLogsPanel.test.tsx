import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerLogsPanel } from "./ServerLogsPanel";

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

describe("ServerLogsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        listServerLogs: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            serverId: server.id,
            updateFiles: [],
            backups: [],
            events: [
              {
                id: 42,
                serverId: server.id,
                type: "error",
                severity: "error",
                message: "Something broke",
                createdAt: "2026-07-23T10:01:00.000Z",
                details: {
                  what: "Operational failure",
                  cause: "Disk full during backup",
                  location: "D:\\Backups",
                  suggestion: "Free disk space and retry",
                  context: { kind: "world" },
                },
              },
              {
                id: 41,
                serverId: server.id,
                type: "server_started",
                severity: "info",
                message: "Server started",
                createdAt: "2026-07-23T09:00:00.000Z",
                details: null,
              },
            ],
            runtimeLogLines: ["line"],
          },
        }),
        getServerRuntimeLog: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            serverId: server.id,
            runtimeLogLines: ["line"],
          },
        }),
        readServerUpdateLog: vi.fn(),
        exportServerLogs: vi.fn(),
        openServerUpdateLogFile: vi.fn(),
        clearServerEvents: vi.fn(),
        clearServerRuntimeLog: vi.fn(),
        deleteServerUpdateLog: vi.fn(),
        clearServerUpdateLogs: vi.fn(),
        deleteBackups: vi.fn(),
        onBackupsChanged: vi.fn(() => () => undefined),
      },
    });
  });

  it("highlights the focused event after load", async () => {
    const onFocusConsumed = vi.fn();
    render(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          focus={{ section: "events", eventId: 42 }}
          onFocusConsumed={onFocusConsumed}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
    const focused = document.querySelector('[data-log-event-id="42"]');
    expect(focused?.className).toMatch(/eventRowFocused/);
    await waitFor(() => {
      expect(onFocusConsumed).toHaveBeenCalled();
    });
  });

  it("forces Events tab when focus includes an eventId even if section is updates", async () => {
    render(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          focus={{ section: "updates", eventId: 42 }}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(document.querySelector('[data-log-event-id="42"]')?.className).toMatch(
      /eventRowFocused/,
    );
  });

  it("expands event details on click and only auto-scrolls once per focus", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          focus={{ section: "events", eventId: 42 }}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
    expect(await screen.findByText(/Disk full during backup/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    const scrollCalls = scrollIntoView.mock.calls.length;

    await user.click(screen.getByRole("tab", { name: "Runtime" }));
    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(scrollIntoView.mock.calls.length).toBe(scrollCalls);

    await user.click(screen.getByRole("button", { name: /Something broke/i }));
    expect(screen.queryByText(/Disk full during backup/i)).not.toBeInTheDocument();
  });

  it("loads update log content only when a job is selected and clears it when leaving Updates", async () => {
    const user = userEvent.setup();
    vi.mocked(window.api.listServerLogs).mockResolvedValue({
      ok: true,
      data: {
        serverId: server.id,
        updateFiles: [
          {
            fileName: "job-2026-07-23T10-00-00.log",
            fullPath: "C:/ARK/TheIsland/Logs/job-2026-07-23T10-00-00.log",
            modifiedAt: "2026-07-23T10:00:00.000Z",
            sizeBytes: 1200,
            status: "success",
            exitCode: 0,
            durationMs: 5000,
          },
        ],
        backups: [],
        events: [],
        runtimeLogLines: [],
      },
    });
    vi.mocked(window.api.readServerUpdateLog).mockResolvedValue({
      ok: true,
      data: "SteamCMD output line",
    });

    render(
      <AppProviders>
        <ServerLogsPanel server={server} embedded />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("tab", { name: "Updates" }));
    expect(window.api.readServerUpdateLog).not.toHaveBeenCalled();

    await user.click(await screen.findByText("2026-07-23 10:00:00"));
    await waitFor(() => {
      expect(window.api.readServerUpdateLog).toHaveBeenCalledWith(
        server.id,
        "job-2026-07-23T10-00-00.log",
        150_000,
      );
    });
    expect(await screen.findByText("SteamCMD output line")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(screen.queryByText("SteamCMD output line")).not.toBeInTheDocument();
  });

  it("filters Runtime lines by Source select", async () => {
    const user = userEvent.setup();
    vi.mocked(window.api.listServerLogs).mockResolvedValue({
      ok: true,
      data: {
        serverId: server.id,
        updateFiles: [],
        backups: [],
        events: [],
        runtimeLogLines: [
          "[2026-07-29T20:11:41.709Z] [system] Starting process",
          "[2026-07-29T20:11:43.237Z] [log] ARK Version: 92.28",
          "[2026-07-29T20:11:43.581Z] [stderr] GameAnalytics noise",
        ],
      },
    });

    render(
      <AppProviders>
        <ServerLogsPanel server={server} embedded focus={{ section: "runtime" }} />
      </AppProviders>,
    );

    expect(await screen.findByText(/ARK Version: 92.28/)).toBeInTheDocument();
    expect(screen.getByText(/GameAnalytics noise/)).toBeInTheDocument();

    await user.click(screen.getByRole("textbox", { name: "Source" }));
    await user.click(await screen.findByRole("option", { name: "Server log" }));

    expect(screen.getByText(/ARK Version: 92.28/)).toBeInTheDocument();
    expect(screen.queryByText(/GameAnalytics noise/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Starting process/)).not.toBeInTheDocument();
  });

  it("quietly refreshes Runtime via runtime-only IPC while that tab is open", async () => {
    vi.useFakeTimers();
    try {
      const getServerRuntimeLog = vi.mocked(window.api.getServerRuntimeLog);
      render(
        <AppProviders>
          <ServerLogsPanel server={server} embedded focus={{ section: "runtime" }} />
        </AppProviders>,
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(getServerRuntimeLog.mock.calls.length).toBe(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1600);
      });
      expect(getServerRuntimeLog.mock.calls.length).toBeGreaterThan(0);
      expect(getServerRuntimeLog).toHaveBeenCalledWith(server.id);
    } finally {
      vi.useRealTimers();
    }
  });
});
