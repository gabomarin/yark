import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { notifications } from "@mantine/notifications";
import { formatPlayerSessionNotes } from "@shared/backup-player-meta";
import type { BackupRecord, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { setupUser } from "@renderer/test/setupUser";
import { ServerBackupPanel } from "./ServerBackupPanel";

const server: ServerProfile = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/srv-1",
  enabled: true,
  autoStart: false,
  sessionName: "Island",
  maxPlayers: 70,
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
  processLive: false,
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
  mapToken: "TheIsland_WP",
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
  mapToken: null,
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
  mapToken: null,
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
  mapToken: null,
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
  mapToken: null,
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

async function collapseSettings(user: ReturnType<typeof setupUser>): Promise<void> {
  const toggle = await screen.findByRole("button", {
    name: /World schedule & retention|Player retention|INI retention/i,
  });
  if (toggle.getAttribute("aria-expanded") === "true") {
    await user.click(toggle);
  }
}

async function expandSettings(user: ReturnType<typeof setupUser>): Promise<void> {
  const toggle = await screen.findByRole("button", {
    name: /World schedule & retention|Player retention|INI retention/i,
  });
  if (toggle.getAttribute("aria-expanded") !== "true") {
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
            schedulePaused: false,
          },
        }),
        createManualBackup: vi.fn().mockResolvedValue({ ok: true, data: [worldBackup] }),
        deleteBackups: vi.fn().mockResolvedValue({ ok: true, data: 1 }),
        deleteFailedBackups: vi.fn().mockResolvedValue({ ok: true, data: 0 }),
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
        exportBackup: vi.fn().mockResolvedValue({ ok: true, data: "D:/export.zip" }),
        importBackup: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            id: "imported-1",
            serverId: "srv-1",
            type: "manual",
            kind: "world",
            path: "D:/Backups/World/imported.zip",
            sizeBytes: 10,
            status: "completed",
            createdAt: "2026-01-01T00:00:00.000Z",
            completedAt: "2026-01-01T00:00:00.000Z",
            notes: "Imported",
            mapToken: "TheIsland_WP",
          },
        }),
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

    expect(await screen.findByRole("button", { name: "Backup now" })).toBeDisabled();
  });

  it("locks create and restore when installation is not Ready", async () => {
    const user = setupUser();
    render(
      <AppProviders>
        <ServerBackupPanel
          server={server}
          runtime={runtime}
          embedded
          installation={{
            serverId: "srv-1",
            installed: false,
            health: "empty",
            reasonCodes: ["dir_empty"],
            guidance: "Install ASA server files into this empty folder with Install / SteamCMD.",
            build: null,
            steamBuild: null,
            arkVersion: null,
            version: null,
            binaryPath: "C:/ARK/srv-1/ShooterGame/Binaries/Win64/ArkAscendedServer.exe",
            checkedAt: "2026-07-24T00:00:00.000Z",
          }}
        />
      </AppProviders>,
    );

    expect(await screen.findByText(/Install files required/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backup now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: `Restore backup ${worldBackup.id}` }),
    ).toBeDisabled();

    await user.click(screen.getByRole("tab", { name: "Player profiles" }));
    expect(screen.queryByRole("button", { name: "Backup now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
  });

  it("shows embedded header, shared destination, and policy open by default", async () => {
    const user = setupUser();
    renderPanel();

    expect(await screen.findByRole("heading", { name: "Backups", level: 4 })).toBeInTheDocument();
    expect(screen.getByLabelText(/Destination/i)).toBeInTheDocument();
    expect(document.querySelector("[data-server-backup-destination]")).toBeTruthy();
    expect(document.querySelector("[data-server-backup-metrics]")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Backups for /i })).not.toBeInTheDocument();

    const worldToggle = screen.getByRole("button", { name: /World schedule & retention/i });
    expect(worldToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("switch", { name: /Schedule/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save policy/i })).not.toBeInTheDocument();

    await collapseSettings(user);
    expect(screen.queryByRole("switch", { name: /Schedule/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Schedule off · keep 20/i)).toBeInTheDocument();
    // Shared destination stays visible while kind policy is collapsed.
    expect(screen.getByLabelText(/Destination/i)).toBeInTheDocument();

    // Collapse is not kept when switching kinds.
    await user.click(screen.getByRole("tab", { name: "Player profiles" }));
    expect(screen.queryByText(/World schedule & retention/i)).not.toBeInTheDocument();
    const playersToggle = screen.getByRole("button", { name: /Player retention/i });
    expect(playersToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(/Keep last \(per player\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Destination/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save$/i })).not.toBeInTheDocument();

    await collapseSettings(user);
    expect(screen.queryByLabelText(/Keep last \(per player\)/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Keep last 20 per player/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "INI" }));
    const iniToggle = screen.getByRole("button", { name: /INI retention/i });
    expect(iniToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(/Keep last INI/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Destination/i)).toBeInTheDocument();

    await collapseSettings(user);
    expect(screen.queryByLabelText(/Keep last INI/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^Keep last 10$/i)).toBeInTheDocument();
  });

  it("autosaves policy changes after edits", async () => {
    const user = setupUser();
    renderPanel();

    const retain = await screen.findByLabelText(/^Keep last \(per map\)$/i);
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
    const user = setupUser();
    renderPanel();

    expect(await screen.findByRole("tab", { name: "World save" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Player profiles" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "INI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Backup now$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open folder C:\/backups\/world/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Copy details bk-world/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open folder C:\/backups\/players/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open folder C:\/backups\/ini/i })).not.toBeInTheDocument();
    expect(screen.queryByText("C:/backups/world")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Player profiles" }));
    expect(screen.queryByRole("button", { name: /Backup all players/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Backup now$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Import$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open folder C:\/backups\/players/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open folder C:\/backups\/world/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "INI" }));
    expect(screen.getByRole("button", { name: /^Backup now$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Import$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open folder C:\/backups\/ini/i })).toBeInTheDocument();
  });

  it("copies backup details to the clipboard", async () => {
    const user = setupUser();
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
    const user = setupUser();
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    renderPanel();

    expect(await screen.findByRole("button", { name: /^Backup now$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Backup now$/i }));

    await waitFor(() => {
      expect(window.api.createManualBackup).toHaveBeenCalledWith("srv-1", ["world"]);
    });
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Backups",
          message: "World save backup completed.",
          color: "teal",
        }),
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "INI" }));
    await user.click(screen.getByRole("button", { name: /^Backup now$/i }));

    await waitFor(() => {
      expect(window.api.createManualBackup).toHaveBeenCalledWith("srv-1", ["ini"]);
    });

    await user.click(screen.getByRole("tab", { name: "Player profiles" }));
    expect(screen.queryByRole("button", { name: /^Backup now$/i })).not.toBeInTheDocument();
    expect(window.api.createManualBackup).not.toHaveBeenCalledWith("srv-1", ["players"]);
  });

  it("scopes selection to the active kind subtab", async () => {
    const user = setupUser();
    renderPanel();

    expect(await screen.findByRole("button", { name: /Open folder C:\/backups\/world/i })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Select backup bk-world/i }));
    expect(screen.getByRole("button", { name: /Delete \(1\)/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Player profiles" }));
    expect(screen.getByRole("button", { name: /^Delete$/i })).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: /Select backup bk-world/i })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Select backup bk-players/i })).not.toBeChecked();
  });

  it("clears hidden selections when current-map filtering is enabled", async () => {
    const user = setupUser();
    const otherMap: BackupRecord = {
      ...worldBackup,
      id: "bk-other-map",
      path: "C:/backups/other-map",
      mapToken: "ScorchedEarth_WP",
    };
    renderPanel([worldBackup, otherMap]);

    const currentMapOnly = await screen.findByRole("checkbox", {
      name: /Current map only/i,
    });
    await user.click(currentMapOnly);
    await user.click(screen.getByRole("checkbox", { name: /Select backup bk-other-map/i }));
    expect(screen.getByRole("button", { name: /Delete \(1\)/i })).toBeEnabled();

    await user.click(currentMapOnly);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Delete$/i })).toBeDisabled();
    });
  });

  it("clears failed rows through the unpaginated backend operation", async () => {
    const user = setupUser();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Clear failed" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Clear failed" }),
    );

    await waitFor(() => {
      expect(window.api.deleteFailedBackups).toHaveBeenCalledWith("srv-1", "world");
    });
  });

  it("lists player names and supports search", async () => {
    const user = setupUser();
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
  });

  it("sorts player backups by finish time via the Date column", async () => {
    const user = setupUser();
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
      mapToken: null,
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
    const user = setupUser();
    let pushHandler: ((payload: { serverId: string }) => void) | undefined;
    (window.api.onBackupsChanged as ReturnType<typeof vi.fn>).mockImplementation(
      (handler: (payload: { serverId: string }) => void) => {
        pushHandler = handler;
        return () => undefined;
      },
    );

    renderPanel();
    await expandSettings(user);
    (window.api.pickPath as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: "D:\\Custom\\Backups",
    });
    const destination = await screen.findByLabelText(/Destination/i);
    expect(destination.tagName).toBe("DIV");
    await user.click(screen.getByRole("button", { name: /Browse/i }));
    expect(destination).toHaveTextContent("D:\\Custom\\Backups");

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
        schedulePaused: false,
      },
    });

    pushHandler?.({ serverId: "srv-1" });

    await waitFor(() => {
      expect(window.api.listBackups).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText(/Destination/i)).toHaveTextContent("D:\\Custom\\Backups");
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
