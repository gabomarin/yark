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
        id: "job-cancelled",
        operation: "install-files",
        serverId: "srv-4",
        serverName: "Center",
        status: "cancelled",
        phase: "cancelled",
        nextActions: ["retry", "dismiss"],
      }),
      job({
        id: "job-attention",
        operation: "update",
        serverId: "srv-5",
        serverName: "Aberration",
        status: "failed",
        phase: "failed",
        lastError: "SteamCMD exited with code 7.",
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
    const pageHandlers = handlers();
    render(
      <AppProviders>
        <DownloadsPage
          status={baseStatus()}
          console={null}
          servers={[]}
          {...pageHandlers}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("heading", { name: "No transfers right now" })).toBeInTheDocument();
    expect(
      screen.getByText(/SteamCMD is ready\. Your installs, updates, and verify jobs will appear here\./i),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-downloads-page]")).not.toBeNull();
    expect(document.querySelector("[data-steamcmd-console]")).not.toBeNull();
    expect(screen.queryByText("progress: 38")).not.toBeInTheDocument();
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

  it("groups Active, Paused, Queued, Cancelled, and Needs attention rows", () => {
    renderPage(populatedStatus());

    const page = document.querySelector("[data-downloads-page]");
    expect(page).not.toBeNull();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(document.querySelector('[data-queue-group="active"]')).not.toBeNull();
    expect(document.querySelector('[data-queue-group="paused"]')).not.toBeNull();
    expect(document.querySelector('[data-queue-group="queued"]')).not.toBeNull();
    expect(document.querySelector('[data-queue-group="cancelled"]')).not.toBeNull();
    expect(document.querySelector('[data-queue-group="attention"]')).not.toBeNull();
    expect(document.querySelector('[data-download-row="job-active"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /Island/ })).toBeInTheDocument();
  });

  it("puts Pause on the active row and keeps the console on the active job when a queued row is selected", async () => {
    const user = userEvent.setup();
    renderPage(populatedStatus());

    expect(document.querySelector("[data-download-live-action]")).not.toBeNull();
    expect(screen.getByText("progress: 38")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Scorched/ }));
    expect(screen.getByText("progress: 38")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove from queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel this job" })).not.toBeInTheDocument();
    const queuedRow = document.querySelector('[data-download-row="job-queued"]');
    expect(queuedRow).not.toBeNull();
    expect(
      within(queuedRow as HTMLElement).getByRole("button", { name: "Cancel download" }),
    ).toBeEnabled();
  });

  it("cancels a queued job without calling live SteamCMD cancel", async () => {
    const user = userEvent.setup();
    const pageHandlers = renderPage(populatedStatus());
    const queuedRow = document.querySelector('[data-download-row="job-queued"]');
    expect(queuedRow).not.toBeNull();

    await user.click(
      within(queuedRow as HTMLElement).getByRole("button", { name: "Cancel download" }),
    );
    expect(pageHandlers.onCancelJob).toHaveBeenCalledWith("job-queued");
    expect(pageHandlers.onCancelLive).not.toHaveBeenCalled();
    expect(pageHandlers.onPauseLive).not.toHaveBeenCalled();
  });

  it("shows Waiting for progress in the console when an active job has no SteamCMD output yet", () => {
    render(
      <AppProviders>
        <DownloadsPage
          status={baseStatus({
            busy: true,
            running: true,
            operation: "update",
            serverId: "srv-1",
            progressPercent: 0,
            progressLabel: "Updating server files…",
            criticalJobs: [
              job({
                id: "job-active",
                operation: "update",
                status: "running",
                phase: "downloading",
                nextActions: [],
              }),
            ],
          })}
          console={{ lines: [], updatedAt: "2026-08-18T00:00:00.000Z" }}
          servers={[server()]}
          {...handlers()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Waiting for progress…")).toBeInTheDocument();
  });

  it("shows SteamCMD console output for restart-interrupted jobs", () => {
    render(
      <AppProviders>
        <DownloadsPage
          status={baseStatus({
            busy: true,
            criticalJobs: [
              job({
                id: "job-interrupted",
                operation: "update",
                status: "failed",
                phase: "applying-files",
                recoveryReason:
                  'YARK closed during phase "applying-files". Retry to continue.',
                nextActions: ["retry", "dismiss"],
              }),
            ],
          })}
          console={{
            lines: [
              "[stdout] Update state (0x61) downloading",
              "Retry when ready",
            ],
            updatedAt: "2026-08-18T00:00:00.000Z",
          }}
          servers={[server()]}
          {...handlers()}
        />
      </AppProviders>,
    );

    const consolePane = document.querySelector("[data-steamcmd-console]");
    expect(consolePane).not.toBeNull();
    expect(consolePane?.textContent).toContain("Update state (0x61) downloading");
    expect(consolePane?.textContent).toContain("Retry when ready");
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
