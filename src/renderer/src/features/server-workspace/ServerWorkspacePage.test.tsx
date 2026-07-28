import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerWorkspacePage } from "./ServerWorkspacePage";

const serverA = {
  id: "srv-a",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  sessionName: "Island",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "admin",
  clusterId: "cluster-1",
  clusterDir: "C:/ARK/Cluster",
  extraArgs: [],
  mods: ["111"],
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

function renderWorkspace(onSelectServer = vi.fn()): void {
  render(
    <AppProviders>
      <ServerWorkspacePage
        servers={[serverA, serverB]}
        selectedServerId={serverA.id}
        statuses={new Map()}
        installationInfo={new Map()}
        clusterReports={[]}
        onSelectServer={onSelectServer}
        onBack={vi.fn()}
        onStartServer={vi.fn()}
        onStopServer={vi.fn()}
        onRestartServer={vi.fn()}
        onKillServer={vi.fn()}
        onOpenFolder={vi.fn()}
        onInstallFiles={vi.fn()}
        onUpdateNow={vi.fn()}
        onVerifyFiles={vi.fn()}
        onSendRcon={vi.fn()}
        onServerUpdated={vi.fn()}
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
            gameUserSettings: `[ServerSettings]\nMaxPlayers=70\nAllowFlyerCarryPVE=True\n`,
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
    });
  });

  it("renders workspace with server list and allows switching servers", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByText("Scorched Earth"));
    expect(onSelectServer).toHaveBeenCalledWith("srv-b");
  });

  it("opens the Backups tab with create and history UI", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "Backups" }));

    expect(await screen.findByRole("button", { name: /^Backup$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "World save" })).toBeInTheDocument();
    expect(screen.getByText(/World destination & schedule/i)).toBeInTheDocument();
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
    const user = userEvent.setup();
    const onSelectServer = vi.fn();

    renderWorkspace(onSelectServer);

    expect(
      await screen.findByRole("button", { name: "Switch server" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Switch server" }));
    const serverDialog = await screen.findByRole("dialog", { name: "Switch server" });
    await waitFor(() => expect(serverDialog).toBeVisible());
    expect(within(serverDialog).getByText("All servers")).toBeVisible();

    await user.click(within(serverDialog).getByText("Scorched Earth"));
    expect(onSelectServer).toHaveBeenCalledWith("srv-b");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Switch server" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Status and actions" }));
    const actionsDialog = await screen.findByRole("dialog", { name: "Status and actions" });
    await waitFor(() => expect(actionsDialog).toBeVisible());
    expect(within(actionsDialog).getByText("Quick actions")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Status and actions" })).not.toBeInTheDocument();
    });
  });

  it("shows only available category filters and resets an invalid filter between INI files", async () => {
    const user = userEvent.setup();
    vi.mocked(window.api.readServerIni).mockResolvedValue({
      ok: true,
      data: {
        serverId: serverA.id,
        gameUserSettingsPath: "C:/ARK/srv-a/GameUserSettings.ini",
        gameIniPath: "C:/ARK/srv-a/Game.ini",
        gameUserSettingsExisted: true,
        gameIniExisted: true,
        payload: {
          gameUserSettings: "[SessionSettings]\nSessionName=Test\n",
          game: "[Custom]\nTotallyUnknownSettingXYZ=1\n",
        },
      },
    });
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "INI Files" }));
    const fileSelect = screen.getByRole("textbox", { name: "INI file" });
    await user.click(fileSelect);
    await user.click(screen.getByRole("option", { name: "Game.ini" }));
    await waitFor(() => {
      expect(screen.getAllByText("TotallyUnknownSettingXYZ").length).toBeGreaterThan(0);
    });

    const categorySelect = screen.getByRole("textbox", {
      name: "Filter by category",
    });
    expect(categorySelect).toHaveValue("All settings (1)");

    await user.click(categorySelect);
    expect(screen.getByRole("option", { name: "Other (1)" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Mods/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Other (1)" }));
    expect(categorySelect).toHaveValue("Other (1)");

    await user.click(fileSelect);
    await user.click(screen.getByRole("option", { name: "GameUserSettings.ini" }));
    await waitFor(() => {
      expect(screen.getAllByText("SessionName").length).toBeGreaterThan(0);
      expect(categorySelect).toHaveValue("All settings (1)");
    });
  });

  it("ignores client settings without showing a warning or pending changes", async () => {
    const user = userEvent.setup();
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
            "MaxPlayers=70",
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
      expect(screen.getByText("MaxPlayers")).toBeInTheDocument();
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
    const user = userEvent.setup();
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

  it("blocks the assistant while the manual INI editor has pending changes", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "INI Files" }));
    const maxPlayers = await screen.findByDisplayValue("70");
    fireEvent.change(maxPlayers, { target: { value: "80" } });
    await user.click(screen.getByRole("tab", { name: "Server" }));

    expect(
      screen.getByRole("button", { name: "Configuration wizard" }),
    ).toBeDisabled();
  });

  it("reviews and explicitly applies the assistant draft", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(
      screen.getByRole("button", { name: "Configuration wizard" }),
    );
    await user.click(await screen.findByRole("button", { name: /Play with friends/ }));
    await user.click(
      screen.getByRole("switch", {
        name: "Settings for one person or a small group",
      }),
    );
    await user.click(screen.getByRole("button", { name: /View \d+ changes/ }));
    const changesDialog = await screen.findByRole("dialog", {
      name: "Draft changes",
    });
    expect(within(changesDialog).getByText("Taming")).toBeInTheDocument();
    expect(within(changesDialog).getByText("3×")).toBeInTheDocument();
    expect(
      within(changesDialog).getByText("Single-player style settings"),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("3× → 7.5×")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("5× → 45×")).toBeVisible();
    expect(screen.getByText("0.5× → 0.075×")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Define how the world feels" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "Gentle" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Review before applying" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(
      await screen.findByRole("heading", { name: "Configuration applied" }),
    ).toBeVisible();
    expect(window.api.previewServerIni).toHaveBeenCalledTimes(1);
    expect(window.api.saveServerIni).toHaveBeenCalledTimes(1);
    // Hidden editor + wizard initial load + re-read before save.
    expect(window.api.readServerIni).toHaveBeenCalledTimes(3);
    const savedPayload = vi.mocked(window.api.saveServerIni).mock.calls[0]?.[1];
    expect(savedPayload?.gameUserSettings).toContain("TamingSpeedMultiplier=3");
    expect(savedPayload?.game).toContain("BabyMatureSpeedMultiplier=5");
    expect(savedPayload?.game).toContain("bUseSingleplayerSettings=True");
  });
});
