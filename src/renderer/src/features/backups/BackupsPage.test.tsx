import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { BackupRecord, ServerProfile } from "@shared/types";
import { BackupsPage } from "./BackupsPage";

const server: ServerProfile = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/srv-1",
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

const completedBackup: BackupRecord = {
  id: "bk-1",
  serverId: "srv-1",
  type: "manual",
  kind: "world",
  path: "C:/backups/bk-1",
  sizeBytes: 2048,
  status: "completed",
  createdAt: "2026-07-24T12:00:00.000Z",
  completedAt: "2026-07-24T12:01:00.000Z",
  notes: null,
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
        listBackups: vi.fn().mockResolvedValue({ ok: true, data: [completedBackup] }),
        getBackupPolicy: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            serverId: "srv-1",
            enabled: false,
            intervalMinutes: 60,
            retainCountWorld: 20,
            retainCountPlayers: 20,
            retainCountIni: 10,
            backupDir: null,
            updatedAt: "2026-07-24T00:00:00.000Z",
          },
        }),
        createManualBackup: vi.fn().mockResolvedValue({ ok: true, data: [completedBackup] }),
        deleteBackups: vi.fn().mockResolvedValue({ ok: true, data: 1 }),
        restoreBackup: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        setBackupPolicy: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            serverId: "srv-1",
            enabled: true,
            intervalMinutes: 120,
            retainCountWorld: 10,
            retainCountPlayers: 20,
            retainCountIni: 10,
            backupDir: "C:/ARK/srv-1/Backups",
            updatedAt: "2026-07-24T13:00:00.000Z",
          },
        }),
        resolveBackupRoot: vi.fn().mockResolvedValue({
          ok: true,
          data: "C:/ARK/srv-1/Backups",
        }),
        openBackupFolder: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        openBackupRoot: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        pickPath: vi.fn(),
        onBackupsChanged: vi.fn(() => () => undefined),
      },
    });
  });

  it("lists per-server backup settings and opens server workspace backups", async () => {
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

    expect(await screen.findByRole("heading", { name: "Backup settings" })).toBeInTheDocument();
    expect(screen.getByText(/World schedule and shared destination/i)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "The Island" })).toBeInTheDocument();
    expect(screen.getByText(/World schedule off/i)).toBeInTheDocument();
    expect(screen.getByText(/Destination: C:\/ARK\/srv-1\/Backups/i)).toBeInTheDocument();
    expect(screen.getByText(/Latest backup:/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create backup/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open in server/i }));
    expect(onOpenServerBackups).toHaveBeenCalledWith("srv-1");
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
});
