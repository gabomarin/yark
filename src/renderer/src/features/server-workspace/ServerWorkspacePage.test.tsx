import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { setupUser } from "@renderer/test/setupUser";
import { ServerWorkspacePage, type RconHistoryEntry } from "./ServerWorkspacePage";
import type { PlayerListState } from "./components/RconPanel/PlayerListSection";

const serverA = {
  id: "srv-a",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  sessionName: "Island",
  maxPlayers: 70,
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "admin",
  clusterId: "cluster-1",
  clusterDir: "C:/ARK/Cluster",
  extraArgs: [],
  mods: ["111"],
  enabled: true,
  autoStart: false,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

const serverB = {
  ...serverA,
  id: "srv-b",
  name: "Scorched Earth",
  map: "ScorchedEarth_WP",
  mods: [],
};

const EMPTY_PLAYER_LIST: PlayerListState = {
  players: [],
  error: null,
  loading: false,
};
const playerListHandlers = {
  onRconTabFocusChanged: vi.fn(async () => undefined),
  onRefreshPlayers: vi.fn(async () => undefined),
  onKickPlayer: vi.fn(async () => true),
  onBanPlayer: vi.fn(async () => true),
  onClearRconHistory: vi.fn(),
};

function renderWorkspace(
  onSelectServer = vi.fn(),
  onSendRcon = vi.fn(async () => true),
  rconHistory: RconHistoryEntry[] = [],
  extra: {
    onBack?: () => void;
    onCreateServer?: () => void;
    onRegisterLeaveGuard?: (guard: ((action: () => void) => void) | null) => void;
    onServerUpdated?: () => void;
  } = {},
): void {
  render(
    <AppProviders>
      <ServerWorkspacePage
        servers={[serverA, serverB]}
        selectedServerId={serverA.id}
        statuses={new Map()}
        installationInfo={new Map()}
        events={[]}
        rconHistory={rconHistory}
        playerList={EMPTY_PLAYER_LIST}
        onSelectServer={onSelectServer}
        onBack={extra.onBack ?? vi.fn()}
        onCreateServer={extra.onCreateServer}
        onRegisterLeaveGuard={extra.onRegisterLeaveGuard}
        onStartServer={vi.fn()}
        onStopServer={vi.fn()}
        onRestartServer={vi.fn()}
        onKillServer={vi.fn()}
        onOpenFolder={vi.fn()}
        onInstallFiles={vi.fn()}
        onUpdateNow={vi.fn()}
        onVerifyFiles={vi.fn()}
        onSendRcon={onSendRcon}
        {...playerListHandlers}
        onCopyConfiguration={vi.fn()}
        onServerUpdated={extra.onServerUpdated ?? vi.fn()}
      />
    </AppProviders>,
  );
}

describe("ServerWorkspacePage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal("api", {
      readServerIni: vi.fn(async (serverId: string) => ({
        ok: true,
        data: {
          serverId,
          gameUserSettingsPath: `C:/ARK/${serverId}/GameUserSettings.ini`,
          gameIniPath: `C:/ARK/${serverId}/Game.ini`,
          gameUserSettingsExisted: true,
          gameIniExisted: true,
          payload: {
            gameUserSettings: `[ServerSettings]\nXPMultiplier=1.5\nAllowFlyerCarryPVE=True\n`,
            game: `[/Script/ShooterGame.ShooterGameMode]\nXPMultiplier=1.0\n`,
          },
        },
      })),
      saveServerIni: vi.fn(async () => ({
        ok: true,
        data: { valid: true, issues: [], diff: [], changedCount: 1 },
      })),
      previewServerIni: vi.fn(async () => ({
        ok: true,
        data: { valid: true, issues: [], diff: [], changedCount: 1 },
      })),
      openServerIniInEditor: vi.fn(async () => ({ ok: true, data: undefined })),
      updateServer: vi.fn(async () => ({ ok: true, data: serverA })),
      updateServerPatch: vi.fn(async () => ({ ok: true, data: serverA })),
      listBackups: vi.fn(async () => ({ ok: true, data: [] })),
      getBackupPolicy: vi.fn(async (serverId: string) => ({
        ok: true,
        data: {
          serverId,
          enabled: false,
          intervalMinutes: 60,
          retainCountWorld: 20,
          retainCountPlayers: 20,
          retainCountIni: 10,
          backupDir: null,
          updatedAt: "2026-07-24T00:00:00.000Z",
        },
      })),
      resolveBackupRoot: vi.fn(async () => ({
        ok: true,
        data: "C:/ARK/TheIsland/Backups",
      })),
      createManualBackup: vi.fn(),
      deleteBackups: vi.fn(),
      restoreBackup: vi.fn(),
      setBackupPolicy: vi.fn(),
      openBackupFolder: vi.fn(),
      openBackupRoot: vi.fn(),
      exportBackup: vi.fn(),
      importBackup: vi.fn(),
      pickPath: vi.fn(),
      getModMetadata: vi.fn(async (modId: string) => ({
        ok: true,
        data: {
          id: modId,
          name: `Mod ${modId}`,
          summary: "Test",
          thumbnailUrl: null,
          authors: [],
          downloadCount: 0,
          dateModified: new Date(0).toISOString(),
          curseforgeUrl: `https://www.curseforge.com/ark-survival-ascended/search?search=${modId}`,
          slug: modId,
        },
      })),
      getModsMetadata: vi.fn(async (modIds: string[]) => ({
        ok: true,
        data: modIds.map((modId) => ({
          id: modId,
          name: `Mod ${modId}`,
          summary: "Test",
          thumbnailUrl: null,
          authors: [],
          downloadCount: 0,
          dateModified: new Date(0).toISOString(),
          curseforgeUrl: `https://www.curseforge.com/ark-survival-ascended/search?search=${modId}`,
          slug: modId,
        })),
      })),
      searchMods: vi.fn(async () => ({
        ok: true,
        data: { items: [], pagination: { index: 0, pageSize: 50, resultCount: 0, totalCount: 0 } },
      })),
      getModByReference: vi.fn(),
      openCurseForgeMod: vi.fn(async () => ({ ok: true, data: undefined })),
      getRconStatus: vi.fn(async (serverId: string) => ({
        ok: true,
        data: {
          serverId,
          status: "connected",
          lastError: null,
        },
      })),
      retryRconConnection: vi.fn(async () => ({ ok: true, data: undefined })),
      notifyRconTabFocus: vi.fn(async () => ({ ok: true, data: [] })),
      refreshPlayerList: vi.fn(async () => ({ ok: true, data: [] })),
      kickPlayer: vi.fn(async () => ({ ok: true, data: "" })),
      banPlayer: vi.fn(async () => ({ ok: true, data: "" })),
      listBannedPlayers: vi.fn(async () => ({ ok: true, data: [] })),
      openBanListFile: vi.fn(async () => ({ ok: true, data: undefined })),
      unbanPlayer: vi.fn(async () => ({
        ok: true,
        data: { banned: [], warning: null },
      })),
      onRconStatusChanged: vi.fn(() => () => undefined),
      onPlayerListUpdated: vi.fn(() => () => undefined),
      getAppUpdateStatus: vi.fn(async () => ({
        ok: true as const,
        data: {
          phase: "idle" as const,
          currentVersion: "0.1.0",
          availableVersion: null,
          percent: null,
          error: null,
          isPackaged: false,
          releasePageUrl: "https://github.com/gabomarin/yark/releases",
          releaseNotesUrl: null,
          installBlockedReason: "dev" as const,
          installBlockedMessage: "Install is only available in the packaged Windows app.",
        },
      })),
      checkForAppUpdate: vi.fn(async () => ({
        ok: true as const,
        data: {
          phase: "up-to-date" as const,
          currentVersion: "0.1.0",
          availableVersion: null,
          percent: null,
          error: null,
          isPackaged: false,
          releasePageUrl: "https://github.com/gabomarin/yark/releases",
          releaseNotesUrl: null,
          installBlockedReason: "dev" as const,
          installBlockedMessage: "Install is only available in the packaged Windows app.",
        },
      })),
      downloadAppUpdate: vi.fn(async () => ({
        ok: false as const,
        error: "not packaged",
      })),
      installAppUpdate: vi.fn(async () => ({
        ok: false as const,
        error: "not packaged",
      })),
      openYarkReleaseNotes: vi.fn(async () => ({ ok: true as const, data: undefined })),
      onAppUpdate: vi.fn(() => () => undefined),
      getClusterIniTemplate: vi.fn(async () => ({ ok: true as const, data: null })),
      previewClusterIniSeed: vi.fn(async () => ({
        ok: true as const,
        data: {
          operation: "seed" as const,
          clusterId: "cluster-1",
          serverId: "srv-a",
          serverName: "The Island",
          preview: { valid: true, issues: [], diff: [], changedCount: 2 },
          files: { gameUserSettings: true, game: true },
        },
      })),
      previewClusterIniRestore: vi.fn(async () => ({
        ok: true as const,
        data: {
          operation: "restore" as const,
          clusterId: "cluster-1",
          serverId: "srv-a",
          serverName: "The Island",
          preview: { valid: true, issues: [], diff: [], changedCount: 2 },
          files: { gameUserSettings: true, game: true },
        },
      })),
      seedClusterIniFromTemplate: vi.fn(async () => ({
        ok: true as const,
        data: {
          operation: "seed" as const,
          clusterId: "cluster-1",
          serverId: "srv-a",
          preview: { valid: true, issues: [], diff: [], changedCount: 2 },
          files: { gameUserSettings: true, game: true },
          template: {
            clusterId: "cluster-1",
            payload: { gameUserSettings: "", game: "" },
            updatedAt: "2026-08-16T00:00:00.000Z",
          },
          backupId: null,
          snapshotDir: null,
        },
      })),
      restoreClusterIniFromTemplate: vi.fn(async () => ({
        ok: true as const,
        data: {
          operation: "restore" as const,
          clusterId: "cluster-1",
          serverId: "srv-a",
          preview: { valid: true, issues: [], diff: [], changedCount: 2 },
          files: { gameUserSettings: true, game: true },
          template: {
            clusterId: "cluster-1",
            payload: { gameUserSettings: "", game: "" },
            updatedAt: "2026-08-16T00:00:00.000Z",
          },
          backupId: null,
          snapshotDir: null,
        },
      })),
    });
  });

  it("renders workspace with server list and allows switching servers", async () => {
    const user = setupUser();
    const onSelectServer = vi.fn();

    renderWorkspace(onSelectServer);

    expect(screen.getByText("All servers")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Island" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Server" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "INI Files" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Backups" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Mods" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Configuration wizard" }),
    ).toBeVisible();

    // List item title (Map select also shows official label "Scorched Earth").
    await user.click(screen.getByTitle("Scorched Earth"));
    expect(onSelectServer).toHaveBeenCalledWith("srv-b");
  });

  it("opens the Backups tab with create and history UI", async () => {
    const user = setupUser();
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "Backups" }));

    expect(await screen.findByRole("button", { name: /^Backup$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "World save" })).toBeInTheDocument();
    expect(screen.getByText(/World destination & schedule/i)).toBeInTheDocument();
  });

  it("renders the RCON tab with quick commands and sends commands", async () => {
    const user = setupUser();
    const onSendRcon = vi.fn(async () => true);
    render(
      <AppProviders>
        <ServerWorkspacePage
          servers={[serverA, serverB]}
          selectedServerId={serverA.id}
          statuses={
            new Map([
              [
                serverA.id,
                {
                  serverId: serverA.id,
                  status: "running",
                  processLive: true,
                  pid: 42,
                  startedAt: "2026-07-23T00:00:00.000Z",
                  lastError: null,
                },
              ],
            ])
          }
          installationInfo={new Map()}
          events={[]}
          rconHistory={[]}
          playerList={EMPTY_PLAYER_LIST}
          onSelectServer={vi.fn()}
          onBack={vi.fn()}
          onStartServer={vi.fn()}
          onStopServer={vi.fn()}
          onRestartServer={vi.fn()}
          onKillServer={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onSendRcon={onSendRcon}
          {...playerListHandlers}
          onCopyConfiguration={vi.fn()}
        onServerUpdated={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("tab", { name: "RCON" }));

    expect(
      screen.getByText(/Admin commands for the active server/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/rcon command/i)).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Banned")).toBeInTheDocument();
    expect(screen.getByText("Console history")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SaveWorld" }));
    expect(onSendRcon).toHaveBeenLastCalledWith("srv-a", "SaveWorld");
    const input = screen.getByLabelText(/rcon command/i);
    await user.clear(input);
    await user.type(input, "cheat ListPlayers");
    await user.click(screen.getByRole("button", { name: /^Send$/i }));

    expect(onSendRcon).toHaveBeenLastCalledWith("srv-a", "cheat ListPlayers");

    await user.click(screen.getByRole("button", { name: "Broadcast" }));
    expect(input).toHaveValue("Broadcast ");
  });

  it("shows RCON responses in the compact history panel", async () => {
    const user = setupUser();
    renderWorkspace(
      vi.fn(),
      vi.fn(async () => true),
      [
        {
          id: "rcon-no-content",
          command: "DestroyWildDinos",
          createdAt: "2026-07-24T12:35:56.000Z",
          status: "success",
          response: "Server received, But no response!!",
          error: null,
        },
        {
          id: "rcon-empty",
          command: "SaveWorld",
          createdAt: "2026-07-24T12:35:50.000Z",
          status: "success",
          response: null,
          error: null,
        },
        {
          id: "rcon-1",
          command: "ListPlayers",
          createdAt: "2026-07-24T12:34:56.000Z",
          status: "success",
          response: "Player1\nPlayer2",
          error: null,
        },
        {
          id: "rcon-err",
          command: "BadCmd",
          createdAt: "2026-07-24T12:34:00.000Z",
          status: "error",
          response: null,
          error: "RCON not connected",
        },
      ],
    );

    await user.click(screen.getByRole("tab", { name: "RCON" }));

    expect(screen.getByText("Console history")).toBeInTheDocument();
    expect(screen.getAllByText("ListPlayers")).toHaveLength(2);
    expect(screen.getAllByText(/Player1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Player2/).length).toBeGreaterThan(0);
    expect(
      screen.queryByText("Server received, But no response!!"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("No response")).toHaveLength(2);
    expect(screen.getByText("RCON not connected")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.queryByText(/may not be allowed via RCON/i)).not.toBeInTheDocument();
  });

  it("disables Send for an identical pending command and Clear keeps pending", async () => {
    const user = setupUser();
    const onClearRconHistory = vi.fn();
    render(
      <AppProviders>
        <ServerWorkspacePage
          servers={[serverA, serverB]}
          selectedServerId={serverA.id}
          statuses={
            new Map([
              [
                serverA.id,
                {
                  serverId: serverA.id,
                  status: "running",
                  processLive: true,
                  pid: 42,
                  startedAt: "2026-07-23T00:00:00.000Z",
                  lastError: null,
                },
              ],
            ])
          }
          installationInfo={new Map()}
          events={[]}
          rconHistory={[
            {
              id: "pending-1",
              command: "ListPlayers",
              createdAt: "2026-07-24T12:00:00.000Z",
              status: "pending",
              response: null,
              error: null,
            },
            {
              id: "done-1",
              command: "SaveWorld",
              createdAt: "2026-07-24T11:00:00.000Z",
              status: "success",
              response: null,
              error: null,
            },
          ]}
          playerList={EMPTY_PLAYER_LIST}
          onSelectServer={vi.fn()}
          onBack={vi.fn()}
          onStartServer={vi.fn()}
          onStopServer={vi.fn()}
          onRestartServer={vi.fn()}
          onKillServer={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onSendRcon={vi.fn(async () => true)}
          {...playerListHandlers}
          onClearRconHistory={onClearRconHistory}
          onCopyConfiguration={vi.fn()}
        onServerUpdated={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("tab", { name: "RCON" }));
    const input = screen.getByLabelText(/rcon command/i);
    await user.clear(input);
    await user.type(input, "ListPlayers");
    expect(screen.getByRole("button", { name: /^Send$/i })).toBeDisabled();

    await user.clear(input);
    await user.type(input, "GetChat");
    expect(screen.getByRole("button", { name: /^Send$/i })).toBeEnabled();

    expect(screen.getByText("Sending…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear RCON history" }));
    expect(onClearRconHistory).toHaveBeenCalledWith("srv-a");
  });

  it("keeps SidePanel Save world wired to RCON and Copy configuration callable", async () => {
    const user = setupUser();
    const onSendRcon = vi.fn(async () => true);
    const onCopyConfiguration = vi.fn();
    const onUpdateNow = vi.fn();
    render(
      <AppProviders>
        <ServerWorkspacePage
          servers={[serverA, serverB]}
          selectedServerId={serverA.id}
          statuses={
            new Map([
              [
                serverA.id,
                {
                  serverId: serverA.id,
                  status: "running",
                  processLive: true,
                  pid: 42,
                  startedAt: "2026-07-23T00:00:00.000Z",
                  lastError: null,
                },
              ],
            ])
          }
          installationInfo={new Map()}
          events={[]}
          rconHistory={[]}
          playerList={EMPTY_PLAYER_LIST}
          onSelectServer={vi.fn()}
          onBack={vi.fn()}
          onStartServer={vi.fn()}
          onStopServer={vi.fn()}
          onRestartServer={vi.fn()}
          onKillServer={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={onUpdateNow}
          onVerifyFiles={vi.fn()}
          onSendRcon={onSendRcon}
          {...playerListHandlers}
          onCopyConfiguration={onCopyConfiguration}
          onServerUpdated={vi.fn()}
        />
      </AppProviders>,
    );

    const forceUpdate = screen.getByRole("button", { name: "Force update" });
    expect(forceUpdate).toBeDisabled();
    expect(forceUpdate).toHaveAttribute(
      "title",
      "Stop the server before updating files",
    );
    await user.click(forceUpdate);
    expect(onUpdateNow).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save world" }));
    expect(onSendRcon).toHaveBeenCalledWith("srv-a", "SaveWorld");

    await user.click(screen.getByRole("button", { name: "Copy configuration" }));
    expect(onCopyConfiguration).toHaveBeenCalledWith("srv-a");
  });

  it("moves secondary panels into drawers in compact workspaces", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches:
        query === "(max-width: 1599px)" || /prefers-reduced-motion:\s*reduce/i.test(query),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    const user = setupUser();
    const onSelectServer = vi.fn();

    renderWorkspace(onSelectServer);

    expect(
      await screen.findByRole("button", { name: "Switch server" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Switch server" }));
    const serverDialog = await screen.findByRole("dialog", { name: "Switch server" });
    expect(serverDialog).toBeVisible();
    expect(within(serverDialog).getByText("All servers")).toBeVisible();

    await user.click(within(serverDialog).getByText("Scorched Earth"));
    expect(onSelectServer).toHaveBeenCalledWith("srv-b");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Switch server" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Status and actions" }));
    const actionsDialog = await screen.findByRole("dialog", { name: "Status and actions" });
    expect(actionsDialog).toBeVisible();
    expect(within(actionsDialog).getByText("Quick actions")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Status and actions" })).not.toBeInTheDocument();
    });
  });

  it("keeps the Backups kind tab when the workspace crosses the compact breakpoint", async () => {
    const compactQuery = "(max-width: 1599px)";
    let compactMatches = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();

    vi.stubGlobal("matchMedia", (query: string) => {
      const isCompactQuery = query === compactQuery;
      const mediaQueryList = {
        get matches() {
          if (isCompactQuery) return compactMatches;
          return /prefers-reduced-motion:\s*reduce/i.test(query);
        },
        media: query,
        onchange: null as ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
        addListener: (listener: (event: MediaQueryListEvent) => void) => {
          if (isCompactQuery) listeners.add(listener);
        },
        removeListener: (listener: (event: MediaQueryListEvent) => void) => {
          listeners.delete(listener);
        },
        addEventListener: (
          type: string,
          listener: EventListenerOrEventListenerObject | ((event: MediaQueryListEvent) => void),
        ) => {
          if (type === "change" && isCompactQuery && typeof listener === "function") {
            listeners.add(listener as (event: MediaQueryListEvent) => void);
          }
        },
        removeEventListener: (
          type: string,
          listener: EventListenerOrEventListenerObject | ((event: MediaQueryListEvent) => void),
        ) => {
          if (typeof listener === "function") {
            listeners.delete(listener as (event: MediaQueryListEvent) => void);
          }
        },
        dispatchEvent: () => false,
      };
      return mediaQueryList;
    });

    const user = setupUser();
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "Backups" }));
    await user.click(await screen.findByRole("tab", { name: "INI" }));
    expect(screen.getByRole("tab", { name: "INI" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    compactMatches = true;
    for (const listener of [...listeners]) {
      listener({ matches: true, media: compactQuery } as MediaQueryListEvent);
    }

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch server" })).toBeVisible();
    });
    expect(screen.getByRole("tab", { name: "INI" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    compactMatches = false;
    for (const listener of [...listeners]) {
      listener({ matches: false, media: compactQuery } as MediaQueryListEvent);
    }

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Switch server" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "INI" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows only available category filters and resets an invalid filter between INI files", async () => {
    const user = setupUser();
    vi.mocked(window.api.readServerIni).mockResolvedValue({
      ok: true,
      data: {
        serverId: serverA.id,
        gameUserSettingsPath: "C:/ARK/srv-a/GameUserSettings.ini",
        gameIniPath: "C:/ARK/srv-a/Game.ini",
        gameUserSettingsExisted: true,
        gameIniExisted: true,
        payload: {
          gameUserSettings: "[ServerSettings]\nAllowFlyerCarryPVE=True\n",
          game: "[Custom]\nTotallyUnknownSettingXYZ=1\n",
        },
      },
    });
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "INI Files" }));
    const fileSwitch = screen.getByRole("radiogroup", { name: "INI file" });
    await user.click(within(fileSwitch).getByRole("radio", { name: "Game.ini" }));
    await waitFor(() => {
      expect(screen.getAllByText("TotallyUnknownSettingXYZ").length).toBeGreaterThan(0);
    });

    const categorySelect = screen.getByRole("combobox", {
      name: "Filter by category",
    });
    expect(categorySelect).toHaveValue("All settings (1)");

    await user.click(categorySelect);
    expect(screen.getByRole("option", { name: "Other (1)" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Mods/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Other (1)" }));
    expect(categorySelect).toHaveValue("Other (1)");

    await user.click(within(fileSwitch).getByRole("radio", { name: "GameUserSettings.ini" }));
    await waitFor(() => {
      expect(screen.getAllByText("AllowFlyerCarryPVE").length).toBeGreaterThan(0);
      expect(categorySelect).toHaveValue("All settings (1)");
    });
  });

  it("ignores client settings without showing a warning or pending changes", async () => {
    const user = setupUser();
    vi.mocked(window.api.readServerIni).mockResolvedValue({
      ok: true,
      data: {
        serverId: serverA.id,
        gameUserSettingsPath: "C:/ARK/srv-a/GameUserSettings.ini",
        gameIniPath: "C:/ARK/srv-a/Game.ini",
        gameUserSettingsExisted: true,
        gameIniExisted: true,
        payload: {
          gameUserSettings: [
            "[ServerSettings]",
            "XPMultiplier=1.5",
            "",
            "[/Script/ShooterGame.ShooterGameUserSettings]",
            "LastJoinedSessionPerCategory=Foo",
            "ResolutionSizeX=1920",
            "",
          ].join("\n"),
          game: "",
        },
      },
    });
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "INI Files" }));
    await waitFor(() => {
      expect(screen.getByText("XPMultiplier")).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/Client keys or history were detected/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("LastJoinedSessionPerCategory")).not.toBeInTheDocument();
    expect(screen.queryByText("ResolutionSizeX")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("discards an assistant draft without writing INI files", async () => {
    const user = setupUser();
    renderWorkspace();

    await user.click(
      screen.getByRole("button", { name: "Configuration wizard" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Set up the play experience" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Play with friends/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave the wizard" });
    await user.click(
      within(dialog).getByRole("button", { name: "Discard draft" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Server information" }),
    ).toBeVisible();
    expect(window.api.saveServerIni).not.toHaveBeenCalled();
  });

  it("confirms before leaving INI Files with unsaved changes (#299)", async () => {
    const user = setupUser();
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "INI Files" }));
    const xp = await screen.findByDisplayValue("1.5");
    fireEvent.change(xp, { target: { value: "2" } });
    await user.click(screen.getByRole("tab", { name: "Server" }));

    expect(screen.getByText(/^ini modified$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save and continue/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "INI Files" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(screen.getByRole("tab", { name: "INI Files" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "Server" }));
    await user.click(screen.getByRole("button", { name: /discard and continue/i }));
    expect(screen.getByRole("tab", { name: "Server" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Configuration wizard" }),
    ).toBeEnabled();
  });

  it("does not load INI until the INI Files tab is opened", async () => {
    renderWorkspace();

    await screen.findByRole("heading", { name: "Server information" });
    expect(window.api.readServerIni).not.toHaveBeenCalled();

    const user = setupUser();
    await user.click(screen.getByRole("tab", { name: "INI Files" }));
    await waitFor(() => {
      expect(window.api.readServerIni).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("XPMultiplier")).toBeVisible();
  });

  it("warns in raw GameUserSettings that Server settings override max players", async () => {
    const user = setupUser();
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "INI Files" }));
    await screen.findByText("XPMultiplier");
    await user.click(screen.getByRole("radio", { name: "Text" }));

    expect(
      screen.getByRole("alert", { name: "Server settings override" }),
    ).toHaveTextContent(/-WinLiveMaxPlayers/i);
    expect(
      screen.getByRole("alert", { name: "Server settings override" }),
    ).toHaveTextContent(/empty or 0/i);
  });

  it("reviews and explicitly applies the assistant draft", async () => {
    const user = setupUser();
    renderWorkspace();

    await user.click(
      screen.getByRole("button", { name: "Configuration wizard" }),
    );
    await user.click(await screen.findByRole("button", { name: /Play with friends/ }));
    expect(screen.getByRole("button", { name: /Play with friends/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("High impact")).toBeVisible();
    expect(screen.getByText("Fast taming")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    await user.click(
      screen.getByRole("switch", {
        name: "Enable single-player settings",
      }),
    );
    await user.click(screen.getByRole("button", { name: /View \d+ changes/ }));
    const changesDialog = await screen.findByRole("dialog", {
      name: "Draft changes",
    });
    expect(within(changesDialog).getByText("Taming")).toBeInTheDocument();
    expect(within(changesDialog).getByText("TamingSpeedMultiplier")).toBeInTheDocument();
    expect(within(changesDialog).getByText("3×")).toBeInTheDocument();
    expect(
      within(changesDialog).getByText("Enable single-player settings"),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("3× → 7.5×")).toBeVisible();
    expect(screen.getByText("Max wild level 150")).toBeVisible();
    expect(screen.getByText("WildCard official")).toBeVisible();
    expect(screen.queryByText(/DifficultyOffset/)).not.toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "INI details" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/DifficultyOffset/);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("5× → 45×")).toBeVisible();
    expect(screen.getByText("0.5× → 0.075×")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Define how the world feels" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "Very easy" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Review before applying" }),
    ).toBeVisible();
    expect(screen.getByText("TamingSpeedMultiplier")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /View \d+ changes/ }),
    ).not.toBeInTheDocument();
    vi.mocked(window.api.previewServerIni).mockResolvedValue({
      ok: true,
      data: { valid: true, issues: [], diff: [], changedCount: 24 },
    });
    await user.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(
      await screen.findByRole("heading", { name: "Configuration applied" }),
    ).toBeVisible();
    expect(
      screen.getByText(/Only the settings in this wizard were changed/i),
    ).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /24 settings were updated on The Island/i,
    );
    expect(window.api.previewServerIni).toHaveBeenCalledTimes(1);
    expect(window.api.saveServerIni).toHaveBeenCalledTimes(1);
    // Wizard initial load + re-read before save (INI editor is not pre-mounted).
    expect(window.api.readServerIni).toHaveBeenCalledTimes(2);
    const savedPayload = vi.mocked(window.api.saveServerIni).mock.calls[0]?.[1];
    expect(savedPayload?.gameUserSettings).toContain("TamingSpeedMultiplier=3");
    expect(savedPayload?.game).toContain("BabyMatureSpeedMultiplier=5");
    expect(savedPayload?.game).toContain("bUseSingleplayerSettings=True");
  });

  it("offers Match cluster defaults and restores the template on apply (#230)", async () => {
    const user = setupUser();
    vi.mocked(window.api.getClusterIniTemplate).mockResolvedValue({
      ok: true,
      data: {
        clusterId: "cluster-1",
        payload: {
          gameUserSettings: "[ServerSettings]\nXPMultiplier=2\n",
          game: "[/Script/ShooterGame.ShooterGameMode]\n",
        },
        updatedAt: "2026-08-16T00:00:00.000Z",
      },
    });
    renderWorkspace();

    await user.click(
      screen.getByRole("button", { name: "Configuration wizard" }),
    );
    expect(
      await screen.findByRole("button", { name: /Match cluster defaults/ }),
    ).toBeVisible();
    expect(screen.queryByText(/No cluster INI template yet/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Match cluster defaults/ }));
    expect(
      screen.queryByRole("switch", {
        name: "Enable single-player settings",
      }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByRole("heading", { name: "Review cluster defaults" }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Set the progression pace" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply cluster defaults" }));

    expect(
      await screen.findByRole("heading", { name: "Configuration applied" }),
    ).toBeVisible();
    expect(window.api.previewClusterIniRestore).toHaveBeenCalledWith(
      "cluster-1",
      "srv-a",
      { gameUserSettings: true, game: true },
    );
    expect(window.api.restoreClusterIniFromTemplate).toHaveBeenCalledWith(
      "cluster-1",
      "srv-a",
      { gameUserSettings: true, game: true },
    );
    expect(window.api.saveServerIni).not.toHaveBeenCalled();
  });

  it("shows a cluster template hint when the member has no template (#230)", async () => {
    const user = setupUser();
    renderWorkspace();

    await user.click(
      screen.getByRole("button", { name: "Configuration wizard" }),
    );
    expect(
      await screen.findByText(/No cluster INI template yet/i),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Match cluster defaults/ }),
    ).not.toBeInTheDocument();
  });

  it("shows stop progress alert with label and progress bar", () => {
    render(
      <AppProviders>
        <ServerWorkspacePage
          servers={[serverA, serverB]}
          selectedServerId={serverA.id}
          statuses={
            new Map([
              [
                serverA.id,
                {
                  serverId: serverA.id,
                  status: "stopping",
                  processLive: true,
                  pid: 42,
                  startedAt: "2026-07-23T00:00:00.000Z",
                  lastError: null,
                },
              ],
            ])
          }
          installationInfo={new Map()}
          events={[]}
          rconHistory={[]}
          playerList={EMPTY_PLAYER_LIST}
          stopProgress={{
            serverId: serverA.id,
            active: true,
            phase: "backing_up",
            label: "Backing up player profiles…",
            percent: 50,
            reason: "user",
          }}
          onSelectServer={vi.fn()}
          onBack={vi.fn()}
          onStartServer={vi.fn()}
          onStopServer={vi.fn()}
          onRestartServer={vi.fn()}
          onKillServer={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onSendRcon={vi.fn(async () => true)}
          {...playerListHandlers}
          onCopyConfiguration={vi.fn()}
        onServerUpdated={vi.fn()}
        />
      </AppProviders>,
    );

    expect(document.querySelector("[data-stop-progress]")).not.toBeNull();
    expect(screen.getByText("Backing up")).toBeInTheDocument();
    expect(screen.getByText("Backing up player profiles…")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Backing up player profiles…" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Force close" })).toBeDisabled();
  });

  it("shows an inactive badge and enable action for a disabled workspace server", async () => {
    const user = setupUser();
    const onToggleServerEnabled = vi.fn();

    const installationInfo = new Map([
      [
        serverA.id,
        {
          serverId: serverA.id,
          installed: true,
          health: "ready" as const,
          reasonCodes: ["ready"],
          guidance: "Installation looks ready to start.",
          build: "1234.56",
          steamBuild: null,
          arkVersion: "1234.56",
          version: "1234.56",
          binaryPath: `${serverA.installDir}/ShooterGame/Binaries/Win64/ArkAscendedServer.exe`,
          checkedAt: "2026-07-24T00:00:00.000Z",
        },
      ],
    ]);

    render(
      <AppProviders>
        <ServerWorkspacePage
          servers={[{ ...serverA, enabled: false }, serverB]}
          selectedServerId={serverA.id}
          statuses={new Map()}
          installationInfo={installationInfo}
          events={[]}
          rconHistory={[]}
          playerList={EMPTY_PLAYER_LIST}
          onSelectServer={vi.fn()}
          onBack={vi.fn()}
          onStartServer={vi.fn()}
          onStopServer={vi.fn()}
          onRestartServer={vi.fn()}
          onKillServer={vi.fn()}
          onToggleServerEnabled={onToggleServerEnabled}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onSendRcon={vi.fn(async () => true)}
          {...playerListHandlers}
          onCopyConfiguration={vi.fn()}
        onServerUpdated={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^Enable$/i }));
    expect(onToggleServerEnabled).toHaveBeenCalledWith(serverA.id, true);
  });

  it("confirms before shell leave discards a dirty Server-tab profile (#299)", async () => {
    const user = setupUser();
    const onLeave = vi.fn();
    let leaveGuard: ((action: () => void) => void) | null = null;

    renderWorkspace(vi.fn(), vi.fn(async () => true), [], {
      onRegisterLeaveGuard: (guard) => {
        leaveGuard = guard;
      },
    });

    await user.type(await screen.findByRole("textbox", { name: /^name$/i }), " X");
    expect(leaveGuard).not.toBeNull();

    act(() => leaveGuard?.(onLeave));

    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByText(/unsaved server changes/i)).toBeInTheDocument();
    expect(screen.getByText(/unsaved server profile changes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save and continue/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Server" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    act(() => leaveGuard?.(onLeave));
    await user.click(screen.getByRole("button", { name: /discard and continue/i }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("does not confirm shell leave when the Server tab is pristine (#299)", async () => {
    const onLeave = vi.fn();
    let leaveGuard: ((action: () => void) => void) | null = null;

    renderWorkspace(vi.fn(), vi.fn(async () => true), [], {
      onRegisterLeaveGuard: (guard) => {
        leaveGuard = guard;
      },
    });

    await screen.findByRole("heading", { name: "Server information" });
    act(() => leaveGuard?.(onLeave));

    expect(onLeave).toHaveBeenCalledOnce();
    expect(screen.queryByText(/unsaved server changes/i)).not.toBeInTheDocument();
  });

  it("confirms before switching server or opening Create with a dirty profile (#299)", async () => {
    const user = setupUser();
    const onSelectServer = vi.fn();
    const onCreateServer = vi.fn();

    renderWorkspace(onSelectServer, vi.fn(async () => true), [], { onCreateServer });

    await user.type(await screen.findByRole("textbox", { name: /^name$/i }), " X");
    await user.click(screen.getByTitle("Scorched Earth"));

    expect(onSelectServer).not.toHaveBeenCalled();
    expect(screen.getByText(/unsaved server profile changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep editing/i }));
    await user.click(screen.getByRole("button", { name: "Add server" }));
    expect(onCreateServer).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /discard and continue/i }));
    expect(onCreateServer).toHaveBeenCalledOnce();
  });

  it("confirms before leaving the Server tab with a dirty profile (#299)", async () => {
    const user = setupUser();
    renderWorkspace();

    await user.type(await screen.findByRole("textbox", { name: /^name$/i }), " X");
    await user.click(screen.getByRole("tab", { name: "INI Files" }));

    expect(screen.getByText(/unsaved server profile changes/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Server" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(screen.getByRole("tab", { name: "Server" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "INI Files" }));
    await user.click(screen.getByRole("button", { name: /discard and continue/i }));
    expect(screen.getByRole("tab", { name: "INI Files" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does not confirm leave after saving Server-tab profile changes (#299)", async () => {
    const user = setupUser();
    const onLeave = vi.fn();
    const onServerUpdated = vi.fn();
    let leaveGuard: ((action: () => void) => void) | null = null;

    renderWorkspace(vi.fn(), vi.fn(async () => true), [], {
      onRegisterLeaveGuard: (guard) => {
        leaveGuard = guard;
      },
      onServerUpdated,
    });

    await user.type(await screen.findByRole("textbox", { name: /^name$/i }), " X");
    await user.click(screen.getByRole("button", { name: /^save changes$/i }));
    await waitFor(() => {
      expect(onServerUpdated).toHaveBeenCalled();
    });

    act(() => leaveGuard?.(onLeave));
    expect(onLeave).toHaveBeenCalledOnce();
    expect(screen.queryByText(/unsaved server changes/i)).not.toBeInTheDocument();
  });

  it("still confirms INI-only dirty shell leave (#299)", async () => {
    const user = setupUser();
    const onLeave = vi.fn();
    let leaveGuard: ((action: () => void) => void) | null = null;

    renderWorkspace(vi.fn(), vi.fn(async () => true), [], {
      onRegisterLeaveGuard: (guard) => {
        leaveGuard = guard;
      },
    });

    await user.click(screen.getByRole("tab", { name: "INI Files" }));
    const xp = await screen.findByDisplayValue("1.5");
    fireEvent.change(xp, { target: { value: "2" } });

    act(() => leaveGuard?.(onLeave));
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /unsaved changes/i })).toBeInTheDocument();
    expect(screen.getByText(/^ini modified$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save and continue/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /discard and continue/i }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("shows Cancel on the Server tab only when the profile is dirty (#299)", async () => {
    const user = setupUser();
    renderWorkspace();

    await screen.findByRole("heading", { name: "Server information" });
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();

    const name = screen.getByRole("textbox", { name: /^name$/i });
    await user.type(name, " X");
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(name).toHaveValue("The Island");
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("saves the profile from the leave confirm then continues (#299)", async () => {
    const user = setupUser();
    const onLeave = vi.fn();
    const onServerUpdated = vi.fn();
    let leaveGuard: ((action: () => void) => void) | null = null;

    renderWorkspace(vi.fn(), vi.fn(async () => true), [], {
      onRegisterLeaveGuard: (guard) => {
        leaveGuard = guard;
      },
      onServerUpdated,
    });

    await user.type(await screen.findByRole("textbox", { name: /^name$/i }), " X");
    act(() => leaveGuard?.(onLeave));
    await user.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() => {
      expect(onServerUpdated).toHaveBeenCalled();
    });
    expect(onLeave).toHaveBeenCalledOnce();
    expect(window.api.updateServer).toHaveBeenCalled();
  });
});
