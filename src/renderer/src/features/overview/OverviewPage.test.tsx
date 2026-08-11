import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { OverviewPage } from "./OverviewPage";

const server = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  enabled: true,
  autoStart: false,
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
    const searchHiddenServer = {
      ...server,
      id: "srv-2",
      name: "Scorched Earth",
      installDir: "C:/ARK/ScorchedEarth",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    };
    const { container } = render(
      <AppProviders>
        <OverviewPage
          search="island"
          onSearchChange={vi.fn()}
          onCreateServer={vi.fn()}
          onImportServer={vi.fn()}
          onCheckUpdates={vi.fn()}
          onCheckInstalls={vi.fn()}
          servers={[server, searchHiddenServer]}
          filteredServers={[server]}
          disabledServers={[]}
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
          onCopyConfiguration={vi.fn()}
          onDeleteServer={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("heading", { name: "Servers", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your servers" })).not.toBeInTheDocument();
    expect(
      screen.getByText("2 enabled servers · none running · 1 result"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search servers" })).toBeInTheDocument();
    // Narrow viewports hide the Recent activity panel; View logs stays available.
    expect(screen.getAllByRole("button", { name: "View logs" }).length).toBeGreaterThan(0);
    expect(screen.getByText("The Island")).toBeInTheDocument();
    expect(screen.queryByText("Advertencias")).not.toBeInTheDocument();

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    const nextSection = header?.nextElementSibling as HTMLElement | null;
    expect(nextSection).not.toBeNull();
    expect(
      within(nextSection as HTMLElement).getByRole("region", { name: "Server list" }),
    ).toBeInTheDocument();
  });

  it("turns Check Servers Health into a loading control while scanning", () => {
    const { container, rerender } = render(
      <AppProviders>
        <OverviewPage
          search=""
          onSearchChange={vi.fn()}
          onCreateServer={vi.fn()}
          onImportServer={vi.fn()}
          onCheckUpdates={vi.fn()}
          onCheckInstalls={vi.fn()}
          checkingInstalls
          servers={[server]}
          filteredServers={[server]}
          disabledServers={[]}
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
          onCopyConfiguration={vi.fn()}
          onDeleteServer={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    const scanning = within(header as HTMLElement).getByRole("button", {
      name: /Checking servers health/i,
    });
    expect(scanning).toHaveAttribute("data-install-health-scan");
    expect(scanning).toHaveAttribute("data-loading", "true");
    expect(within(header as HTMLElement).getByRole("status")).toHaveTextContent(
      "Checking servers health…",
    );
    expect(screen.queryByText("Checking install folders…")).not.toBeInTheDocument();

    rerender(
      <AppProviders>
        <OverviewPage
          search=""
          onSearchChange={vi.fn()}
          onCreateServer={vi.fn()}
          onImportServer={vi.fn()}
          onCheckUpdates={vi.fn()}
          onCheckInstalls={vi.fn()}
          checkingInstalls={false}
          servers={[server]}
          filteredServers={[server]}
          disabledServers={[]}
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
          onCopyConfiguration={vi.fn()}
          onDeleteServer={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(
      screen.getByRole("button", { name: "Check Servers Health" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Checking servers health/i })).not.toBeInTheDocument();
  });

  it("surfaces how many servers need attention", async () => {
    render(
      <AppProviders>
        <OverviewPage
          search=""
          onSearchChange={vi.fn()}
          onCreateServer={vi.fn()}
          onImportServer={vi.fn()}
          onCheckUpdates={vi.fn()}
          onCheckInstalls={vi.fn()}
          servers={[server]}
          filteredServers={[server]}
          disabledServers={[]}
          runningServers={0}
          statuses={new Map()}
          installationInfo={
            new Map([
              [
                server.id,
                {
                  serverId: server.id,
                  installed: false,
                  health: "missing",
                  reasonCodes: ["path_missing"],
                  guidance:
                    "Create the folder or correct the install path, then install server files.",
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
          onCopyConfiguration={vi.fn()}
          onDeleteServer={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getAllByText("1 needs attention").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /Install server files/i }).length,
    ).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "1 needs attention" }));
    expect(screen.getByText("Missing path")).toBeInTheDocument();
    expect(
      screen.getByText(/Create the folder or correct the install path/i),
    ).toBeInTheDocument();
  });

  it("distinguishes loading from the actionable empty state", () => {
    const onCreateServer = vi.fn();
    const sharedProps = {
      search: "",
      onSearchChange: vi.fn(),
      onCreateServer,
      onImportServer: vi.fn(),
      onCheckUpdates: vi.fn(),
      onCheckInstalls: vi.fn(),
      servers: [],
      filteredServers: [],
      disabledServers: [],
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
      onCopyConfiguration: vi.fn(),
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

  it("shows disabled servers in a separate section without putting them in the enabled fleet", async () => {
    const user = userEvent.setup();
    const disabledServer = { ...server, id: "srv-2", name: "Frozen Fjord", enabled: false };

    render(
      <AppProviders>
        <OverviewPage
          search=""
          onSearchChange={vi.fn()}
          onCreateServer={vi.fn()}
          onImportServer={vi.fn()}
          onCheckUpdates={vi.fn()}
          onCheckInstalls={vi.fn()}
          servers={[server, disabledServer]}
          filteredServers={[server]}
          disabledServers={[disabledServer]}
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
          onCopyConfiguration={vi.fn()}
          onDeleteServer={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    // Verify disabled servers badge and toggle are shown
    expect(screen.getAllByText("1 disabled server").length).toBeGreaterThan(0);
    const showDisabledCheckbox = screen.getByRole("checkbox", { name: "Show disabled" });
    expect(showDisabledCheckbox).toBeInTheDocument();
    expect(showDisabledCheckbox).not.toBeChecked();

    // Verify disabled server is not shown initially
    expect(screen.queryByText("Frozen Fjord")).not.toBeInTheDocument();
    expect(screen.getByText("The Island")).toBeInTheDocument();

    // Toggle to show disabled servers
    await user.click(showDisabledCheckbox);

    // Verify both servers are now shown
    expect(screen.getByText("Frozen Fjord")).toBeInTheDocument();
    expect(screen.getByText("The Island")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("renders disabled cards when no enabled server is visible", async () => {
    const user = userEvent.setup();
    const disabledServer = { ...server, enabled: false };

    render(
      <AppProviders>
        <OverviewPage
          search=""
          onSearchChange={vi.fn()}
          onCreateServer={vi.fn()}
          onImportServer={vi.fn()}
          onCheckUpdates={vi.fn()}
          onCheckInstalls={vi.fn()}
          servers={[disabledServer]}
          filteredServers={[]}
          disabledServers={[disabledServer]}
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
          onCopyConfiguration={vi.fn()}
          onDeleteServer={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.queryByText("The Island")).not.toBeInTheDocument();
    expect(screen.getByText("No enabled servers")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Show disabled" }));
    expect(screen.getByText("The Island")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByText("No enabled servers")).not.toBeInTheDocument();
  });
});
