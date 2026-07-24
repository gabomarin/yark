import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { OverviewPage } from "./OverviewPage";

const server = {
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

describe("OverviewPage", () => {
  it("renders the operational server list and recent activity", () => {
    const { container } = render(
      <AppProviders>
        <OverviewPage
          search=""
          onSearchChange={vi.fn()}
          onCreateServer={vi.fn()}
          onCheckUpdates={vi.fn()}
          servers={[server]}
          filteredServers={[server]}
          runningServers={0}
          statuses={new Map()}
          installationInfo={new Map()}
          events={[]}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onStartServer={vi.fn()}
          onStopServer={vi.fn()}
          onRestartServer={vi.fn()}
          onKillServer={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdatesForServer={vi.fn()}
          onCloneServer={vi.fn()}
          onDeleteServer={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("heading", { name: "Servidores", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tus servidores" })).toBeInTheDocument();
    expect(screen.getByText("1 servidor configurado · ninguno activo")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Buscar servidores" })).toBeInTheDocument();
    expect(screen.getByText("Actividad reciente")).toBeInTheDocument();
    expect(screen.getByText("The Island")).toBeInTheDocument();
    expect(screen.queryByText("Advertencias")).not.toBeInTheDocument();

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    const nextSection = header?.nextElementSibling as HTMLElement | null;
    expect(nextSection).not.toBeNull();
    expect(
      within(nextSection as HTMLElement).getByRole("heading", { name: "Tus servidores" }),
    ).toBeInTheDocument();
  });
});
