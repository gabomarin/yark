import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { notifications } from "@mantine/notifications";
import { formatPlayerSessionNotes } from "@shared/backup-player-meta";
import type { BackupRecord, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { ServerBackupPanel } from "./ServerBackupPanel";

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

const runtime: ServerRuntimeInfo = {
  serverId: "srv-1",
  status: "stopped",
  pid: null,
  startedAt: null,
  lastError: null,
};

const worldBackup: BackupRecord = {
  id: "bk-world",
  serverId: "srv-1",
  type: "manual",
  kind: "world",
  path: "C:/backups/world",
  sizeBytes: 2048,
  status: "completed",
  createdAt: "2026-07-24T12:00:00.000Z",
  completedAt: "2026-07-24T12:01:00.000Z",
  notes: null,
};

const playersBackup: BackupRecord = {
  id: "bk-players",
  serverId: "srv-1",
  type: "scheduled",
  kind: "players",
  path: "C:/backups/players",
  sizeBytes: 1024,
  status: "completed",
  createdAt: "2026-07-24T11:00:00.000Z",
  completedAt: "2026-07-24T11:01:00.000Z",
  notes: null,
};

const aliceBackup: BackupRecord = {
  id: "bk-alice",
  serverId: "srv-1",
  type: "player_connect",
  kind: "players",
  path: "C:/backups/alice",
  sizeBytes: 100,
  status: "completed",
  createdAt: "2026-07-24T13:00:00.000Z",
  completedAt: "2026-07-24T13:00:01.000Z",
  notes: formatPlayerSessionNotes("connect", "76561198000000001", "Alice"),
};

const bobBackup: BackupRecord = {
  id: "bk-bob",
  serverId: "srv-1",
  type: "player_disconnect",
  kind: "players",
  path: "C:/backups/bob",
  sizeBytes: 100,
  status: "completed",
  createdAt: "2026-07-24T12:30:00.000Z",
  completedAt: "2026-07-24T12:30:01.000Z",
  notes: formatPlayerSessionNotes("disconnect", "76561198000000002", "Bob"),
};

const iniBackup: BackupRecord = {
  id: "bk-ini",
  serverId: "srv-1",
  type: "manual",
  kind: "ini",
  path: "C:/backups/ini",
  sizeBytes: 512,
  status: "completed",
  createdAt: "2026-07-24T10:00:00.000Z",
  completedAt: "2026-07-24T10:01:00.000Z",
  notes: null,
};

function renderPanel(list: BackupRecord[] = [worldBackup, playersBackup, aliceBackup, bobBackup, iniBackup]): void {
  (window.api.listBackups as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: list,
  });
  render(
    <AppProviders>
      <ServerBackupPanel server={server} runtime={runtime} embedded />
    </AppProviders>,
  );
}

async function collapseSettings(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const toggle = await screen.findByRole("button", {
    name: /World destination & schedule|Player retention|INI retention/i,
  });
  if (toggle.getAttribute("aria-expanded") === "true") {
    await user.click(toggle);
  }
}

describe("ServerBackupPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        listBackups: vi.fn().mockResolvedValue({
          ok: true,
          data: [worldBackup, playersBackup, aliceBackup, bobBackup, iniBackup],
        }),
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
        createManualBackup: vi.fn().mockResolvedValue({ ok: true, data: [worldBackup] }),
        deleteBackups: vi.fn().mockResolvedValue({ ok: true, data: 1 }),
        restoreBackup: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        setBackupPolicy: vi.fn().mockImplementation(async (_id: string, draft: {
          enabled: boolean;
          intervalMinutes: number;
          retainCountWorld: number;
          retainCountPlayers: number;
          retainCountIni: number;
          backupDir: string | null;
        }) => ({
          ok: true,
          data: {
            serverId: "srv-1",
            ...draft,
            updatedAt: "2026-07-24T12:00:00.000Z",
          },
        })),
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

  it("disables manual backup while the stop backup owns the pipeline", async () => {
    render(
      <AppProviders>
        <ServerBackupPanel
          server={server}
          runtime={runtime}
          embedded
          createLocked
          createLockReason="Stop backup in progress"
        />
      </AppProviders>,
    );

    expect(await screen.findByRole("button", { name: "Backup" })).toBeDisabled();
  });

  it("opens kind settings by default and can collapse to a summary", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText(/World destination & schedule/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Schedule/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Destination/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Backups for /i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save policy/i })).not.toBeInTheDocument();

    await collapseSettings(user);
    expect(screen.queryByRole("switch", { name: /Schedule/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Schedule off · keep 20/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Player profiles" }));
    expect(screen.queryByText(/World destination & schedule/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Player retention/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Keep last \(per player\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save$/i })).not.toBeInTheDocument();

    await collapseSettings(user);
    expect(screen.queryByLabelText(/Keep last \(per player\)/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Keep last 20 per player/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "INI" }));
    expect(screen.getByText(/INI retention/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Keep last INI/i)).toBeInTheDocument();

    await collapseSettings(user);
    expect(screen.queryByLabelText(/Keep last INI/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^Keep last 10$/i)).toBeInTheDocument();
  });

  it("autosaves policy changes after edits", async () => {
    const user = userEvent.setup();
    renderPanel();

    const retain = await screen.findByLabelText(/^Keep last$/i);
    await user.clear(retain);
    await user.type(retain, "15");

    await waitFor(() => {
      expect(window.api.setBackupPolicy).toHaveBeenCalledWith(
        "srv-1",
        expect.objectContaining({ retainCountWorld: 15 }),
      );
    });
  });
  it("shows kind subtabs and filters history to the active kind", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByRole("tab", { name: "World save" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Player profiles" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "INI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Backup$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open folder C:\/backups\/world/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Copy details bk-world/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open folder C:\/backups\/players/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open folder C:\/backups\/ini/i })).not.toBeInTheDocument();
    expect(screen.queryByText("C:/backups/world")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Player profiles" }));
    expect(screen.getByRole("button", { name: /Backup all players/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open folder C:\/backups\/players/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open folder C:\/backups\/world/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "INI" }));
    expect(screen.getByRole("button", { name: /^Backup$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open folder C:\/backups\/ini/i })).toBeInTheDocument();
  });

  it("copies backup details to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: /Copy details bk-world/i }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("Backup ID: bk-world"),
      );
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Server: The Island (srv-1)"),
    );
    expect(notifySpy).toHaveBeenCalled();
    notifySpy.mockRestore();
  });

  it("creates a backup for the active kind only and toasts completion", async () => {
    const user = userEvent.setup();
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    renderPanel();

    expect(await screen.findByRole("button", { name: /^Backup$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Backup$/i }));

    await waitFor(() => {
      expect(window.api.createManualBackup).toHaveBeenCalledWith("srv-1", ["world"]);
    });
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "World save backup completed.",
          position: "bottom-right",
          color: "teal",
        }),
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "INI" }));
    await user.click(screen.getByRole("button", { name: /^Backup$/i }));

    await waitFor(() => {
      expect(window.api.createManualBackup).toHaveBeenCalledWith("srv-1", ["ini"]);
    });

    await user.click(screen.getByRole("tab", { name: "Player profiles" }));
    await user.click(screen.getByRole("button", { name: /Backup all players/i }));

    await waitFor(() => {
      expect(window.api.createManualBackup).toHaveBeenCalledWith("srv-1", ["players"]);
    });
  });

  it("scopes selection to the active kind subtab", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByRole("button", { name: /Open folder C:\/backups\/world/i })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Select backup bk-world/i }));
    expect(screen.getByRole("button", { name: /Delete \(1\)/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Player profiles" }));
    expect(screen.getByRole("button", { name: /^Delete$/i })).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: /Select backup bk-world/i })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Select backup bk-players/i })).not.toBeChecked();
  });

  it("lists player names and supports search/sort", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("tab", { name: "Player profiles" }));
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("All players")).toBeInTheDocument();

    const list = document.querySelector("[data-backup-list]") as HTMLElement;
    expect(list).not.toBeNull();
    const titles = () =>
      Array.from(list.querySelectorAll("[data-backup-title]")).map(
        (node) => node.textContent,
      );
    expect(titles()[0]).toBe("Alice");

    await user.type(screen.getByLabelText(/Search players/i), "bob");
    expect(titles()).toEqual(["Bob"]);

    await user.clear(screen.getByLabelText(/Search players/i));
    await user.click(screen.getByRole("combobox", { name: /Sort player backups/i }));
    await user.click(await screen.findByRole("option", { name: /Player A–Z/i }));

    expect(titles()).toEqual(["Alice", "All players", "Bob"]);
  });

  it("sorts player backups by finish time, not job start", async () => {
    const user = userEvent.setup();
    const startedFirstFinishedLast: BackupRecord = {
      id: "bk-long",
      serverId: "srv-1",
      type: "player_disconnect",
      kind: "players",
      path: "C:/backups/carol",
      sizeBytes: 100,
      status: "completed",
      // Started before Alice…
      createdAt: "2026-07-24T12:00:00.000Z",
      // …but finished after Alice.
      completedAt: "2026-07-24T14:00:00.000Z",
      notes: formatPlayerSessionNotes("disconnect", "76561198000000003", "Carol"),
    };

    renderPanel([
      worldBackup,
      playersBackup,
      aliceBackup,
      bobBackup,
      startedFirstFinishedLast,
      iniBackup,
    ]);
    await user.click(await screen.findByRole("tab", { name: "Player profiles" }));

    const list = document.querySelector("[data-backup-list]") as HTMLElement;
    const titles = () =>
      Array.from(list.querySelectorAll("[data-backup-title]")).map(
        (node) => node.textContent,
      );
    // Newest-by-finish: Carol (14:00), Alice (13:00:01), Bob, All players
    expect(titles()[0]).toBe("Carol");
    expect(titles()[1]).toBe("Alice");
  });

  it("preserves unsaved policy edits across quiet backups-changed refresh", async () => {
    const user = userEvent.setup();
    let pushHandler: ((payload: { serverId: string }) => void) | undefined;
    (window.api.onBackupsChanged as ReturnType<typeof vi.fn>).mockImplementation(
      (handler: (payload: { serverId: string }) => void) => {
        pushHandler = handler;
        return () => undefined;
      },
    );

    renderPanel();
    const destination = await screen.findByLabelText(/Destination/i);
    await user.clear(destination);
    await user.type(destination, "D:\\Custom\\Backups");
    expect(destination).toHaveValue("D:\\Custom\\Backups");

    (window.api.listBackups as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: [worldBackup],
    });
    (window.api.getBackupPolicy as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    });

    pushHandler?.({ serverId: "srv-1" });

    await waitFor(() => {
      expect(window.api.listBackups).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText(/Destination/i)).toHaveValue("D:\\Custom\\Backups");
  });

  it("uses relative time as the world row title with type chip", async () => {
    renderPanel([worldBackup]);
    await screen.findByRole("button", { name: /Open folder C:\/backups\/world/i });
    const title = document.querySelector("[data-backup-title]");
    expect(title).not.toBeNull();
    expect(title?.textContent).not.toBe("manual");
    expect(title?.textContent?.length).toBeGreaterThan(0);
    expect(screen.getByText("manual")).toBeInTheDocument();
    expect(screen.queryByText("C:/backups/world")).not.toBeInTheDocument();
  });
});
