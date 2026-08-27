import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { BACKUP_HISTORY_TAB_LABEL, ServerLogsPanel } from "./ServerLogsPanel";

const server = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  enabled: true,
  autoStart: false,
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
    const control = document.querySelector('[data-log-event-id="42"]');
    expect(control).toBeTruthy();
    expect(control?.closest("[class*='eventRowFocused']")).toBeTruthy();
    await waitFor(() => {
      expect(onFocusConsumed).toHaveBeenCalled();
    });
  });

  it("highlights the focused backup under Logs → Backup history", async () => {
    const onFocusConsumed = vi.fn();
    vi.mocked(window.api.listServerLogs).mockResolvedValue({
      ok: true,
      data: {
        serverId: server.id,
        updateFiles: [],
        backups: [
          {
            id: "bak-ok",
            serverId: server.id,
            type: "manual",
            kind: "world",
            path: "C:/ARK/backups/ok.zip",
            sizeBytes: 100,
            status: "completed",
            createdAt: "2026-07-23T11:00:00.000Z",
            completedAt: "2026-07-23T11:01:00.000Z",
            notes: null,
            mapToken: "TheIsland_WP",
          },
          {
            id: "bak-fail",
            serverId: server.id,
            type: "scheduled",
            kind: "world",
            path: "C:/ARK/backups/fail.zip",
            sizeBytes: 0,
            status: "failed",
            createdAt: "2026-07-23T10:00:00.000Z",
            completedAt: "2026-07-23T10:01:00.000Z",
            notes: "Disk full",
            mapToken: "TheIsland_WP",
          },
        ],
        events: [],
        runtimeLogLines: [],
      },
    });

    render(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          focus={{ section: "backups", backupId: "bak-fail" }}
          onFocusConsumed={onFocusConsumed}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("C:/ARK/backups/fail.zip")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: BACKUP_HISTORY_TAB_LABEL })).toHaveAttribute(
      "data-active",
      "true",
    );
    const row = document.querySelector('[data-backup-id="bak-fail"]');
    expect(row).toBeTruthy();
    expect(row?.className).toMatch(/eventRowFocused/);
    await waitFor(() => {
      expect(onFocusConsumed).toHaveBeenCalled();
    });
  });

  it("ignores stale backup focus after a newer focus wins the race", async () => {
    const onFocusConsumed = vi.fn();
    const resolvers: Array<
      (value: Awaited<ReturnType<typeof window.api.listServerLogs>>) => void
    > = [];
    vi.mocked(window.api.listServerLogs).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const logsPayload = {
      serverId: server.id,
      updateFiles: [] as [],
      backups: [
        {
          id: "bak-fail",
          serverId: server.id,
          type: "scheduled" as const,
          kind: "world" as const,
          path: "C:/ARK/backups/fail.zip",
          sizeBytes: 0,
          status: "failed" as const,
          createdAt: "2026-07-23T10:00:00.000Z",
          completedAt: "2026-07-23T10:01:00.000Z",
          notes: "Disk full",
          mapToken: "TheIsland_WP",
        },
      ],
      events: [
        {
          id: 42,
          serverId: server.id,
          type: "error" as const,
          severity: "error" as const,
          message: "Something broke",
          createdAt: "2026-07-23T10:01:00.000Z",
          details: null,
        },
      ],
      runtimeLogLines: [] as string[],
    };

    const { rerender } = render(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          focus={{ section: "backups", backupId: "bak-fail" }}
          onFocusConsumed={onFocusConsumed}
        />
      </AppProviders>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    // Mount load + backups focus load may both call listServerLogs.
    const pendingBeforeRerender = resolvers.length;
    expect(pendingBeforeRerender).toBeGreaterThanOrEqual(1);

    rerender(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          focus={{ section: "events", eventId: 42 }}
          onFocusConsumed={onFocusConsumed}
        />
      </AppProviders>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(resolvers.length).toBeGreaterThan(pendingBeforeRerender);

    await act(async () => {
      // Resolve newest focus first, then any stale loads — stale must not win.
      for (let i = resolvers.length - 1; i >= 0; i -= 1) {
        resolvers[i]!({ ok: true, data: logsPayload });
        await Promise.resolve();
      }
      await Promise.resolve();
    });

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(document.querySelector('[data-backup-id="bak-fail"]')).toBeNull();
    const eventControl = document.querySelector('[data-log-event-id="42"]');
    expect(eventControl?.closest("[class*='eventRowFocused']")).toBeTruthy();
    await waitFor(() => {
      expect(onFocusConsumed).toHaveBeenCalledTimes(1);
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
    const control = document.querySelector('[data-log-event-id="42"]');
    expect(control).toBeTruthy();
    expect(control?.closest("[class*='eventRowFocused']")).toBeTruthy();
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
    await waitFor(() => {
      expect(screen.queryByText(/Disk full during backup/i)).not.toBeInTheDocument();
    });
  });

  it("offers Open Backups tab from empty backup history when embedded", async () => {
    const onOpenBackupsTab = vi.fn();
    render(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          onOpenBackupsTab={onOpenBackupsTab}
        />
      </AppProviders>,
    );

    await userEvent.setup().click(
      await screen.findByRole("tab", { name: BACKUP_HISTORY_TAB_LABEL }),
    );
    const openBackups = await screen.findByRole("button", { name: "Open Backups tab" });
    await userEvent.setup().click(openBackups);
    expect(onOpenBackupsTab).toHaveBeenCalledTimes(1);
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

    // One row button contains title + subtitle. On UTC CI both are
    // "2026-07-23 10:00:00", so findByText is ambiguous; role+name is not.
    await user.click(
      await screen.findByRole("button", { name: /2026-07-23 10:00:00/ }),
    );
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

    await user.click(screen.getByRole("combobox", { name: "Source" }));
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
