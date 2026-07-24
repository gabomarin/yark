import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerCard } from "./ServerCard";

afterEach(cleanup);

const profile = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  sessionName: "The Island Cluster",
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

const installed = {
  serverId: profile.id,
  installed: true,
  build: null,
  steamBuild: null,
  arkVersion: null,
  officialVersion: null,
  officialSteamBuild: null,
  version: null,
  binaryPath: "C:/ARK/TheIsland/ShooterGame/Binaries/Win64/ArkAscendedServer.exe",
  checkedAt: "2026-07-23T00:00:00.000Z",
};

describe("ServerCard", () => {
  it("uses Start as the primary action for an installed stopped server", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onOpenWorkspace = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={installed}
          onStart={onStart}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={onOpenWorkspace}
          onOpenLogs={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^Start$/i }));
    expect(onStart).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Open settings for The Island/i }));
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
  });

  it("uses Manage for a running server and keeps secondary actions in the menu", async () => {
    const user = userEvent.setup();
    const onOpenWorkspace = vi.fn();

    const { container } = render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={{
            serverId: profile.id,
            status: "running",
            pid: 1234,
            startedAt: "2026-07-23T00:00:00.000Z",
            lastError: null,
          }}
          installation={installed}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={onOpenWorkspace}
          onOpenLogs={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    const card = within(container);
    await user.click(card.getByRole("button", { name: "Manage" }));
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
    expect(card.queryByRole("button", { name: /^Start$/i })).not.toBeInTheDocument();

    await user.click(card.getByRole("button", { name: "More options" }));
    expect(
      await screen.findByRole("menuitem", { name: "Stop safely" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Restart" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open folder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete server$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Force close \(matar\)$/i })).not.toBeInTheDocument();
  });

  it("uses Install as the primary action when server files are missing", async () => {
    const user = userEvent.setup();
    const onInstallFiles = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{ ...installed, installed: false }}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={onInstallFiles}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(onInstallFiles).toHaveBeenCalledTimes(1);
  });

  it("shows progress bar while SteamCMD is busy", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            installed: false,
          }}
          steamCmdBusy
          steamCmdProgressPercent={42}
          steamCmdProgressLabel="Downloading · 512.0 / 1024.0 MB"
          steamCmdProgressBytesDownloaded={536870912}
          steamCmdProgressBytesTotal={1073741824}
          steamCmdOperation="install-files"
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getAllByText(/Installing/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Downloading$/i)).toBeInTheDocument();
    expect(screen.getByText(/Downloaded:/i)).toBeInTheDocument();
    expect(screen.getByText(/512\.0 \/ 1024\.0 MB/i)).toBeInTheDocument();
    expect(screen.getByText(/42%/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("does not offer an update when ARK versions differ but Steam builds match", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            arkVersion: "92.21",
            officialVersion: "92.23",
            steamBuild: "build 24346423",
            officialSteamBuild: "build 24346423",
          }}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
  });

  it("offers an update only when the Steam build is behind", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            arkVersion: "92.23",
            officialVersion: "92.23",
            steamBuild: "build 24300000",
            officialSteamBuild: "build 24346423",
          }}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Update available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });
});
