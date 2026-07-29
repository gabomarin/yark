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
          officialSteamBuild={null}
          events={[]}
          onViewAllActivity={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
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

    expect(screen.getByRole("heading", { name: "Servers", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your servers" })).toBeInTheDocument();
    expect(screen.getByText("1 server configured · none running")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search servers" })).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText("The Island")).toBeInTheDocument();
    expect(screen.queryByText("Advertencias")).not.toBeInTheDocument();

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    const nextSection = header?.nextElementSibling as HTMLElement | null;
    expect(nextSection).not.toBeNull();
    expect(
      within(nextSection as HTMLElement).getByRole("heading", { name: "Your servers" }),
    ).toBeInTheDocument();
  });

  it("surfaces how many servers need attention", () => {
    render(
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
          installationInfo={
            new Map([
              [
                server.id,
                {
                  serverId: server.id,
                  installed: false,
                  build: null,
                  steamBuild: null,
                  arkVersion: null,
                  version: null,
                  binaryPath: "C:/ARK/TheIsland/ShooterGameServer.exe",
                  checkedAt: "2026-07-24T00:00:00.000Z",
                },
              ],
            ])
          }
          officialSteamBuild={null}
          events={[]}
          onViewAllActivity={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
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

    expect(screen.getAllByText("1 needs attention").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /Install server files/i }).length,
    ).toBeGreaterThan(0);
  });

  it("distinguishes loading from the actionable empty state", () => {
    const onCreateServer = vi.fn();
    const sharedProps = {
      search: "",
      onSearchChange: vi.fn(),
      onCreateServer,
      onCheckUpdates: vi.fn(),
      servers: [],
      filteredServers: [],
      runningServers: 0,
      statuses: new Map(),
      installationInfo: new Map(),
      officialSteamBuild: null,
      events: [],
      onViewAllActivity: vi.fn(),
      onOpenWorkspace: vi.fn(),
      onOpenLogs: vi.fn(),
      onReviewError: vi.fn(),
      onStartServer: vi.fn(),
      onStopServer: vi.fn(),
      onRestartServer: vi.fn(),
      onKillServer: vi.fn(),
      onOpenFolder: vi.fn(),
      onInstallFiles: vi.fn(),
      onUpdateNow: vi.fn(),
      onVerifyFiles: vi.fn(),
      onCheckUpdatesForServer: vi.fn(),
      onCloneServer: vi.fn(),
      onDeleteServer: vi.fn(),
      onCancelSteamCmd: vi.fn(),
    };

    const { container, rerender } = render(
      <AppProviders>
        <OverviewPage {...sharedProps} loading />
      </AppProviders>,
    );

    expect(screen.getByText("Loading servers")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-server-skeletons] > [aria-hidden='true']")).toHaveLength(
      2,
    );
    expect(screen.queryByText("Create your first server")).not.toBeInTheDocument();

    rerender(
      <AppProviders>
        <OverviewPage {...sharedProps} loading={false} />
      </AppProviders>,
    );

    expect(screen.getByText("Create your first server")).toBeInTheDocument();
    const serverList = container.querySelector("[data-server-list]");
    expect(serverList).not.toBeNull();
    within(serverList as HTMLElement).getByRole("button", { name: "New server" }).click();
    expect(onCreateServer).toHaveBeenCalledOnce();
  });
});
