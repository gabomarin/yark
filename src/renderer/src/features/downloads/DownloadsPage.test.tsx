import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { CriticalJobSummary, ServerProfile, SteamCmdStatus } from "@shared/types";
import { DownloadsPage } from "./DownloadsPage";

afterEach(cleanup);

function job(overrides: Partial<CriticalJobSummary> & Pick<CriticalJobSummary, "id" | "operation" | "status">): CriticalJobSummary {
  return {
    serverId: "srv-1",
    serverName: "Island",
    phase: "queued",
    attempts: 0,
    maxAttempts: 3,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    lastError: null,
    recoveryReason: null,
    nextActions: [],
    ...overrides,
  };
}

function baseStatus(overrides: Partial<SteamCmdStatus> = {}): SteamCmdStatus {
  return {
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
    checkedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

function server(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-1",
    name: "Island",
    map: "TheIsland",
    mapModId: null,
    mapSaveFolder: null,
    installDir: "C:/ARK/Island",
    enabled: true,
    autoStart: false,
    sessionName: "Island",
    maxPlayers: 70,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "test1234",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    updatedAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

function handlers() {
  return {
    onOpenLogs: vi.fn(),
    onCancelLive: vi.fn(),
    onPauseLive: vi.fn(),
    onCancelJob: vi.fn(),
    onRetryJob: vi.fn(),
    onResumeJob: vi.fn(),
    onDismissJob: vi.fn(),
    onReorderJob: vi.fn(),
    onOpenSettings: vi.fn(),
  };
}

function populatedStatus(): SteamCmdStatus {
  return baseStatus({
    busy: true,
    running: true,
    operation: "update",
    serverId: "srv-1",
    progressPercent: 38,
    progressLabel: "Downloading",
    criticalJobs: [
      job({
        id: "job-active",
        operation: "update",
        status: "running",
        phase: "downloading",
        nextActions: [],
      }),
      job({
        id: "job-paused",
        operation: "install-files",
        serverId: "srv-3",
        serverName: "Extinction",
        status: "paused",
        phase: "applying-files",
        nextActions: ["resume", "cancel"],
      }),
      job({
        id: "job-queued",
        operation: "verify-files",
        serverId: "srv-2",
        serverName: "Scorched",
        status: "pending",
        nextActions: ["cancel"],
      }),
      job({
        id: "job-attention",
        operation: "install-files",
        serverId: "srv-4",
        serverName: "Center",
        status: "cancelled",
        phase: "cancelled",
        nextActions: ["retry", "dismiss"],
      }),
    ],
  });
}

function renderPage(
  status: SteamCmdStatus,
  extra?: { servers?: ServerProfile[]; handlers?: ReturnType<typeof handlers> },
) {
  const pageHandlers = extra?.handlers ?? handlers();
  render(
    <AppProviders>
      <DownloadsPage
        status={status}
        console={{ lines: ["progress: 38"], updatedAt: "2026-08-18T00:00:00.000Z" }}
        servers={
          extra?.servers ?? [
            server(),
            server({ id: "srv-2", name: "Scorched", map: "ScorchedEarth" }),
            server({ id: "srv-3", name: "Extinction", map: "Extinction" }),
            server({ id: "srv-4", name: "Center", map: "TheCenter" }),
          ]
        }
        {...pageHandlers}
      />
    </AppProviders>,
  );
  return pageHandlers;
}

describe("DownloadsPage", () => {
  it("shows an empty state when SteamCMD is ready and there is no queue", () => {
    renderPage(baseStatus());

    expect(screen.getByRole("heading", { name: "No transfers right now" })).toBeInTheDocument();
    expect(
      screen.getByText(/SteamCMD is ready\. Your installs, updates, and verify jobs will appear here\./i),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-downloads-page]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Install SteamCMD" })).not.toBeInTheDocument();
  });

  it("offers Install SteamCMD from the empty state when SteamCMD is missing", async () => {
    const user = userEvent.setup();
    const pageHandlers = renderPage(baseStatus({ detected: false, executablePath: null }));

    expect(
      screen.getByText(/Install SteamCMD in Settings first/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Install SteamCMD" }));
    expect(pageHandlers.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("groups Active, Paused, Queued, and Needs attention rows", () => {
    renderPage(populatedStatus());

    const page = document.querySelector("[data-downloads-page]");
    expect(page).not.toBeNull();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(document.querySelector('[data-queue-group="active"]')).not.toBeNull();
    expect(document.querySelector('[data-queue-group="paused"]')).not.toBeNull();
    expect(document.querySelector('[data-queue-group="queued"]')).not.toBeNull();
    expect(document.querySelector('[data-queue-group="attention"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /Island/ })).toHaveAttribute(
      "data-download-row",
      "job-active",
    );
  });

  it("keeps the SteamCMD process bar on the active job and uses Remove from queue on a queued row", async () => {
    const user = userEvent.setup();
    renderPage(populatedStatus());

    expect(screen.getByRole("group", { name: "SteamCMD process" })).toBeInTheDocument();
    expect(screen.getByText("progress: 38")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Scorched/ }));
    expect(screen.queryByRole("group", { name: "SteamCMD process" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from queue" })).toBeEnabled();
    expect(screen.queryByText("progress: 38")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Island/ }));
    expect(screen.getByRole("group", { name: "SteamCMD process" })).toBeInTheDocument();
  });

  it("cancels a queued job without calling live SteamCMD cancel", async () => {
    const user = userEvent.setup();
    const pageHandlers = renderPage(populatedStatus());
    const queued = screen.getByRole("button", { name: /Scorched/ });

    await user.click(within(queued).getByRole("button", { name: "Cancel download" }));
    expect(pageHandlers.onCancelJob).toHaveBeenCalledWith("job-queued");
    expect(pageHandlers.onCancelLive).not.toHaveBeenCalled();
    expect(pageHandlers.onPauseLive).not.toHaveBeenCalled();
  });

  it("shows the SteamCMD missing banner when leftovers remain", async () => {
    const user = userEvent.setup();
    const pageHandlers = renderPage(
      baseStatus({
        detected: false,
        executablePath: null,
        criticalJobs: [
          job({
            id: "job-blocked",
            operation: "update",
            status: "blocked",
            phase: "queued",
            lastError: "SteamCMD is not installed on this PC.",
            nextActions: ["retry", "dismiss"],
          }),
        ],
      }),
    );

    expect(document.querySelector("[data-steamcmd-missing-banner]")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Install SteamCMD" }));
    expect(pageHandlers.onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
