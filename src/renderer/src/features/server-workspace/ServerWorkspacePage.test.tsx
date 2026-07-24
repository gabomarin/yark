import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("ServerWorkspacePage", () => {
  beforeEach(() => {
    vi.stubGlobal("api", {
      readServerIni: vi.fn(async (serverId: string) => ({
        ok: true,
        data: {
          serverId,
          gameUserSettingsPath: `C:/ARK/${serverId}/GameUserSettings.ini`,
          gameIniPath: `C:/ARK/${serverId}/Game.ini`,
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
      openServerIniInEditor: vi.fn(async () => ({ ok: true, data: undefined })),
      updateServer: vi.fn(async () => ({ ok: true, data: serverA })),
    });
  });

  it("renders workspace with server list and allows switching servers", async () => {
    const user = userEvent.setup();
    const onSelectServer = vi.fn();

    render(
      <AppProviders>
        <ServerWorkspacePage
          servers={[serverA, serverB]}
          selectedServerId={serverA.id}
          statuses={new Map()}
          installationInfo={new Map()}
          onSelectServer={onSelectServer}
          onBack={vi.fn()}
          onStartServer={vi.fn()}
          onStopServer={vi.fn()}
          onRestartServer={vi.fn()}
          onKillServer={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onSendRcon={vi.fn()}
          onServerUpdated={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("All Servers")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Island" })).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("MaxPlayers")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Scorched Earth"));
    expect(onSelectServer).toHaveBeenCalledWith("srv-b");
  });
});
