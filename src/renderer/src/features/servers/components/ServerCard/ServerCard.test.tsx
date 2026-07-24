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

const installed = {
  serverId: profile.id,
  installed: true,
  build: null,
  arkVersion: null,
  officialVersion: null,
  version: null,
  binaryPath: "C:/ARK/TheIsland/ShooterGame/Binaries/Win64/ArkAscendedServer.exe",
  checkedAt: "2026-07-23T00:00:00.000Z",
};

describe("ServerCard", () => {
  it("exposes main actions as icon buttons with tooltips", async () => {
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
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onRcon={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^Iniciar$/i }));
    expect(onStart).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Abrir configuración de The Island/i }));
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
  });

  it("disables update and delete while the server is active", () => {
    render(
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
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onRcon={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: /Detén el servidor antes de actualizar/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Detén el servidor antes de eliminarlo/i })).toBeDisabled();
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
          steamCmdProgressLabel="Descargando · 512.0 / 1024.0 MB"
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
