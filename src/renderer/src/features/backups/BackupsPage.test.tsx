import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { BackupFleetSummary, ServerProfile } from "@shared/types";
import { BackupsPage } from "./BackupsPage";

const server: ServerProfile = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/srv-1",
  enabled: true,
  autoStart: false,
  sessionName: "Island",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "secret",
  clusterId: null,
  clusterDir: null,
  extraArgs: [],
  mods: [],
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

const fleetSummary: BackupFleetSummary = {
  servers: [
    {
      serverId: "srv-1",
      serverName: "The Island",
      policy: {
        serverId: "srv-1",
        enabled: false,
        intervalMinutes: 60,
        retainCountWorld: 20,
        retainCountPlayers: 20,
        retainCountIni: 10,
        backupDir: null,
        updatedAt: "2026-07-24T00:00:00.000Z",
      },
      resolvedRoot: "C:/ARK/srv-1/Backups",
      health: "unknown",
      latest: {
        id: "bk-1",
        serverId: "srv-1",
        type: "manual",
        kind: "world",
        path: "C:/backups/bk-1.zip",
        sizeBytes: 2048,
        status: "completed",
        createdAt: "2026-07-24T12:00:00.000Z",
        completedAt: "2026-07-24T12:01:00.000Z",
        notes: null,
        mapToken: "TheIsland_WP",
      },
      latestWorld: {
        id: "bk-1",
        serverId: "srv-1",
        type: "manual",
        kind: "world",
        path: "C:/backups/bk-1.zip",
        sizeBytes: 2048,
        status: "completed",
        createdAt: "2026-07-24T12:00:00.000Z",
        completedAt: "2026-07-24T12:01:00.000Z",
        notes: null,
        mapToken: "TheIsland_WP",
      },
      counts: { world: 1, players: 0, ini: 0, failed24h: 0 },
      usedBytes: 2048,
      stale: false,
      destinationOk: true,
    },
  ],
  stats: {
    protectedCount: 0,
    atRiskCount: 0,
    failed24h: 0,
    totalBackupBytes: 2048,
  },
  disks: [
    {
      volumePath: "C:\\",
      roots: ["C:/ARK/srv-1/Backups"],
      backupBytes: 2048,
      freeBytes: 100 * 1024 ** 3,
      totalBytes: 500 * 1024 ** 3,
      usedPercent: 80,
    },
  ],
  alerts: [],
  diskSettings: {
    warnUsedPercent: 85,
    criticalUsedPercent: 95,
    warnFreeBytes: 20 * 1024 ** 3,
  },
};

describe("BackupsPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        getBackupFleetSummary: vi.fn().mockResolvedValue({ ok: true, data: fleetSummary }),
        dismissBackupFleetAlert: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        getBackupDiskAlertSettings: vi.fn().mockResolvedValue({
          ok: true,
          data: fleetSummary.diskSettings,
        }),
        setBackupDiskAlertSettings: vi.fn().mockResolvedValue({
          ok: true,
          data: fleetSummary.diskSettings,
        }),
        previewBackupCleanup: vi.fn().mockResolvedValue({
          ok: true,
          data: { items: [], totalBytes: 0, byServer: [] },
        }),
        runBackupCleanup: vi.fn().mockResolvedValue({
          ok: true,
          data: { deleted: 0, freedBytes: 0 },
        }),
        listBackups: vi.fn(),
        getBackupPolicy: vi.fn(),
        createManualBackup: vi.fn(),
        deleteBackups: vi.fn(),
        restoreBackup: vi.fn(),
        setBackupPolicy: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            ...fleetSummary.servers[0]!.policy,
            enabled: true,
            intervalMinutes: 120,
            updatedAt: "2026-07-24T13:00:00.000Z",
          },
        }),
        resolveBackupRoot: vi.fn(),
        openBackupFolder: vi.fn(),
        openBackupRoot: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        exportBackup: vi.fn(),
        importBackup: vi.fn(),
        pickPath: vi.fn(),
        onBackupsChanged: vi.fn(() => () => undefined),
      },
    });
  });

  it("shows backup health stats and opens server workspace backups", async () => {
    const user = userEvent.setup();
    const onOpenServerBackups = vi.fn();
    render(
      <AppProviders>
        <BackupsPage
          servers={[server]}
          onOpenServerBackups={onOpenServerBackups}
        />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "Backups" })).toBeInTheDocument();
    expect(screen.getByText(/Backup health, disk usage, and shared destination settings across all servers/i)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "The Island" })).toBeInTheDocument();
    expect(screen.getByText("0/1")).toBeInTheDocument();
    expect(screen.getByText(/Schedule off/i)).toBeInTheDocument();
    expect(screen.getByText("Destination")).toBeInTheDocument();
    expect(screen.getByText("C:/ARK/srv-1/Backups")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create backup/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open in server/i }));
    expect(onOpenServerBackups).toHaveBeenCalledWith("srv-1");
  });

  it("keeps unsaved schedule toggle across quiet refresh and server list poll identity", async () => {
    const user = userEvent.setup();
    const changedListeners: Array<(payload: { serverId: string }) => void> = [];
    (window.api.onBackupsChanged as ReturnType<typeof vi.fn>).mockImplementation(
      (listener: (payload: { serverId: string }) => void) => {
        changedListeners.push(listener);
        return () => {
          const index = changedListeners.indexOf(listener);
          if (index >= 0) changedListeners.splice(index, 1);
        };
      },
    );

    const { rerender } = render(
      <AppProviders>
        <BackupsPage
          servers={[server]}
          onOpenServerBackups={vi.fn()}
        />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "The Island" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit settings/i }));
    const scheduleSwitch = screen.getByRole("switch", {
      name: /enable scheduled world backups/i,
    });
    expect(scheduleSwitch).not.toBeChecked();
    await user.click(scheduleSwitch);
    expect(scheduleSwitch).toBeChecked();

    for (const listener of changedListeners) {
      listener({ serverId: "srv-1" });
    }
    await waitFor(() => {
      expect(window.api.getBackupFleetSummary).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("switch", { name: /enable scheduled world backups/i })).toBeChecked();

    // App refresh replaces the servers array every few seconds with the same ids.
    rerender(
      <AppProviders>
        <BackupsPage
          servers={[{ ...server }]}
          onOpenServerBackups={vi.fn()}
        />
      </AppProviders>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: /enable scheduled world backups/i }),
      ).toBeChecked();
    });
    // Same id set must not trigger another non-quiet fleet load.
    expect(window.api.getBackupFleetSummary).toHaveBeenCalledTimes(2);
  });

  it("edits and saves backup policy from the overview", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <BackupsPage
          servers={[server]}
          onOpenServerBackups={vi.fn()}
        />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "The Island" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit settings/i }));
    await user.click(screen.getByRole("switch", { name: /enable scheduled world backups/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(window.api.setBackupPolicy).toHaveBeenCalledWith(
        "srv-1",
        expect.objectContaining({ enabled: true }),
      );
    });
    expect(await screen.findByText(/Saved backup settings/i)).toBeInTheDocument();
  });

  it("labels disabled servers as inactive", async () => {
    render(
      <AppProviders>
        <BackupsPage
          servers={[{ ...server, enabled: false }]}
          onOpenServerBackups={vi.fn()}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });
});
