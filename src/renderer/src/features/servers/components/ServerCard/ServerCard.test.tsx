import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerCard } from "./ServerCard";

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

describe("ServerCard", () => {
  it("exposes main actions", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            serverId: profile.id,
            installed: true,
            build: null,
            arkVersion: null,
            officialVersion: null,
            version: null,
            binaryPath: "C:/ARK/TheIsland/ShooterGame/Binaries/Win64/ArkAscendedServer.exe",
            checkedAt: "2026-07-23T00:00:00.000Z",
          }}
          onStart={onStart}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onEdit={vi.fn()}
          onOpenIni={vi.fn()}
          onOpenLogs={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onRcon={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^Iniciar$/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows progress bar while SteamCMD is busy", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            serverId: profile.id,
            installed: false,
            build: null,
            arkVersion: null,
            officialVersion: null,
            version: null,
            binaryPath: "C:/ARK/TheIsland/ShooterGame/Binaries/Win64/ArkAscendedServer.exe",
            checkedAt: "2026-07-23T00:00:00.000Z",
          }}
          steamCmdBusy
          steamCmdProgressPercent={42}
          steamCmdProgressLabel="Descargando · 512.0 / 1024.0 MB"
          steamCmdProgressBytesDownloaded={536870912}
          steamCmdProgressBytesTotal={1073741824}
          steamCmdOperation="install-files"
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onEdit={vi.fn()}
          onOpenIni={vi.fn()}
          onOpenLogs={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onRcon={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getAllByText(/Instalando/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Descargando$/i)).toBeInTheDocument();
    expect(screen.getByText(/Descargado:/i)).toBeInTheDocument();
    expect(screen.getByText(/512\.0 \/ 1024\.0 MB/i)).toBeInTheDocument();
    expect(screen.getByText(/42%/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelar operación/i })).toBeInTheDocument();
  });
});
