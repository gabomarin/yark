import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifications } from "@mantine/notifications";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import { App } from "./App";

describe("App empty installation snapshot", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    const api = createRendererApiMock();
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

    const api = createRendererApiMock();
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

describe("App Start busy guard (#390)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("only invokes startServer IPC once for rapid Start clicks", async () => {
    const user = userEvent.setup();
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
    const install = {
      serverId: server.id,
      installed: true,
      health: "ready" as const,
      reasonCodes: ["ready"],
      guidance: "Installation looks ready to start.",
      build: null,
      steamBuild: null,
      arkVersion: null,
      version: null,
      binaryPath: "C:/ARK/TheIsland/ShooterGame/Binaries/Win64/ArkAscendedServer.exe",
      checkedAt: "2026-07-23T00:00:00.000Z",
    };

    const startDeferred: {
      resolve: ((value: { ok: true; data: undefined }) => void) | null;
    } = { resolve: null };
    const api = createRendererApiMock();
    api.listServers = vi.fn().mockResolvedValue({ ok: true, data: [server] });
    api.getStatuses = vi.fn().mockResolvedValue({
      ok: true,
      data: [
        {
          serverId: server.id,
          status: "stopped",
          processLive: false,
          pid: null,
          startedAt: null,
          lastError: null,
        },
      ],
    });
    api.getInstallationInfo = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        officialVersion: "358.12",
        officialNetworkStatus: "online",
        officialSteamBuild: "build 24346423",
        servers: [install],
      },
    });
    api.startServer = vi.fn(
      () =>
        new Promise<{ ok: true; data: undefined }>((resolve) => {
          startDeferred.resolve = resolve;
        }),
    );
    Object.defineProperty(window, "api", {
      configurable: true,
      value: api,
    });

    render(<App />);

    const start = await screen.findByRole("button", { name: "Start server" });
    await user.click(start);
    await user.click(start);

    await waitFor(() => {
      expect(api.startServer).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("button", { name: "Starting…" })).toBeDisabled();

    startDeferred.resolve?.({ ok: true, data: undefined });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start server" })).toBeEnabled();
    });
  });
});
