import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactElement } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerInstallationInfo } from "@shared/types";
import { OverviewPage } from "./OverviewPage";

const server = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  enabled: true,
  autoStart: false,
  sessionName: "The Island Cluster",
  maxPlayers: 70,
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

const readyInstall = (overrides: Partial<ServerInstallationInfo> = {}): ServerInstallationInfo => ({
  serverId: server.id,
  installed: true,
  health: "ready",
  reasonCodes: ["ready"],
  guidance: "Installation looks ready to start.",
  build: "build 111",
  steamBuild: "build 111",
  arkVersion: null,
  version: null,
  binaryPath: "C:/ARK/TheIsland/ShooterGameServer.exe",
  checkedAt: "2026-07-24T00:00:00.000Z",
  ...overrides,
});

function renderOverview(
  overrides: Partial<ComponentProps<typeof OverviewPage>> = {},
) {
  const props: ComponentProps<typeof OverviewPage> = {
    search: "",
    onSearchChange: vi.fn(),
    onCreateServer: vi.fn(),
    onImportServer: vi.fn(),
    onCheckInstalls: vi.fn(),
    servers: [server],
    statuses: new Map(),
    installationInfo: new Map(),
    playerListsByServer: new Map(),
    processMetricsByServer: new Map(),
    officialSteamBuild: null,
    events: [],
    onViewAllActivity: vi.fn(),
    steamCmdStatus: null,
    refresh: vi.fn(async () => ({
      servers: null,
      statuses: null,
      installationInfo: null,
      officialSteamBuild: null,
    })),
    onOpenDownloads: vi.fn(),
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
    onCloneServer: vi.fn(),
    onCopyConfiguration: vi.fn(),
    onDeleteServer: vi.fn(),
    ...overrides,
  };
  return render(
    <AppProviders>
      <OverviewPage {...props} />
    </AppProviders>,
  );
}

describe("OverviewPage", () => {
  it("renders the operational server list and recent activity", () => {
    const secondServer = {
      ...server,
      id: "srv-2",
      name: "Scorched Earth",
      installDir: "C:/ARK/ScorchedEarth",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    };
    const { container } = renderOverview({
      servers: [server, secondServer],
    });

    expect(screen.getByRole("heading", { name: "Servers", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your servers" })).not.toBeInTheDocument();
    expect(screen.getByText("2 enabled servers")).toBeInTheDocument();
    const metrics = document.querySelector("[data-overview-fleet-metrics]");
    expect(metrics).not.toBeNull();
    expect(within(metrics as HTMLElement).getByRole("button", { name: /^Running/i })).toBeInTheDocument();
    expect(within(metrics as HTMLElement).getByRole("button", { name: /^Stopped/i })).toBeInTheDocument();
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).queryByText(/Survivors/)).not.toBeInTheDocument();
    expect(within(header as HTMLElement).queryByText(/^RAM/)).not.toBeInTheDocument();
    expect(within(header as HTMLElement).queryByText(/^CPU/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Online/i })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search servers" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "View logs" }).length).toBeGreaterThan(0);
    expect(screen.getByText("The Island")).toBeInTheDocument();
    expect(screen.getByText("Scorched Earth")).toBeInTheDocument();
    expect(screen.queryByText("Advertencias")).not.toBeInTheDocument();

    const nextSection = header?.nextElementSibling as HTMLElement | null;
    expect(nextSection).not.toBeNull();
    expect(
      within(nextSection as HTMLElement).getByRole("region", { name: "Server list" }),
    ).toBeInTheDocument();
  });

  it("turns Check Servers Health into a loading control while scanning", () => {
    const { container, rerender } = renderOverview({ checkingInstalls: true });

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
          onCheckInstalls={vi.fn()}
          checkingInstalls={false}
          servers={[server]}
          statuses={new Map()}
          installationInfo={new Map()}
          playerListsByServer={new Map()}
          processMetricsByServer={new Map()}
          officialSteamBuild={null}
          events={[]}
          onViewAllActivity={vi.fn()}
          steamCmdStatus={null}
          refresh={vi.fn(async () => ({
            servers: null,
            statuses: null,
            installationInfo: null,
            officialSteamBuild: null,
          }))}
          onOpenDownloads={vi.fn()}
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
          onCloneServer={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDeleteServer={vi.fn()}
        />
      </AppProviders>,
    );

    expect(
      screen.getByRole("button", { name: "Check Servers Health" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Checking servers health/i })).not.toBeInTheDocument();
  });

  it("surfaces how many servers need attention", async () => {
    const user = userEvent.setup();
    renderOverview({
      installationInfo: new Map([
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
            binaryPath: "",
            checkedAt: "2026-07-24T00:00:00.000Z",
          },
        ],
      ]),
    });

    const metrics = document.querySelector("[data-overview-fleet-metrics]");
    expect(metrics).not.toBeNull();
    expect(
      within(metrics as HTMLElement).getByRole("button", { name: /^Needs attention/i }),
    ).toHaveTextContent("1");
    expect(
      screen.getAllByRole("button", { name: /Install server files/i }).length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "Show servers that need attention" }),
    );
    expect(screen.getByText("Missing path")).toBeInTheDocument();
    expect(
      screen.getByText(/Create the folder or correct the install path/i),
    ).toBeInTheDocument();
  });

  it("hides the fleet metric strip when there are no profiles (#314)", () => {
    renderOverview({ servers: [] });

    expect(document.querySelector("[data-overview-fleet-metrics]")).toBeNull();
    expect(screen.getByText("Create your first server")).toBeInTheDocument();
  });

  it("filters the grid from fleet metric tiles and clears on second click (#314)", async () => {
    const user = userEvent.setup();
    const second = {
      ...server,
      id: "srv-2",
      name: "Scorched Earth",
      installDir: "C:/ARK/ScorchedEarth",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    };
    renderOverview({
      servers: [server, second],
      statuses: new Map([
        [
          "srv-1",
          {
            serverId: "srv-1",
            status: "running",
            processLive: true,
            pid: 42,
            startedAt: null,
            lastError: null,
          },
        ],
        [
          "srv-2",
          {
            serverId: "srv-2",
            status: "stopped",
            processLive: false,
            pid: null,
            startedAt: null,
            lastError: null,
          },
        ],
      ]),
    });

    const metrics = document.querySelector("[data-overview-fleet-metrics]");
    expect(metrics).not.toBeNull();
    const metricsScope = within(metrics as HTMLElement);

    expect(screen.getByText("The Island")).toBeInTheDocument();
    expect(screen.getByText("Scorched Earth")).toBeInTheDocument();

    await user.click(metricsScope.getByRole("button", { name: /^Running/i }));
    expect(screen.getByText("The Island")).toBeInTheDocument();
    expect(screen.queryByText("Scorched Earth")).not.toBeInTheDocument();
    expect(screen.getByText(/1 result/)).toBeInTheDocument();

    await user.click(metricsScope.getByRole("button", { name: /^Running/i }));
    expect(screen.getByText("Scorched Earth")).toBeInTheDocument();
  });

  it("distinguishes loading from the actionable empty state", () => {
    const onCreateServer = vi.fn();
    const { container, rerender } = renderOverview({
      onCreateServer,
      servers: [],
      loading: true,
    });

    expect(screen.getByText("Loading servers")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-server-skeletons] > [aria-hidden='true']")).toHaveLength(
      2,
    );
    expect(screen.queryByText("Create your first server")).not.toBeInTheDocument();

    rerender(
      <AppProviders>
        <OverviewPage
          search=""
          onSearchChange={vi.fn()}
          onCreateServer={onCreateServer}
          onImportServer={vi.fn()}
          onCheckInstalls={vi.fn()}
          loading={false}
          servers={[]}
          statuses={new Map()}
          installationInfo={new Map()}
          playerListsByServer={new Map()}
          processMetricsByServer={new Map()}
          officialSteamBuild={null}
          events={[]}
          onViewAllActivity={vi.fn()}
          steamCmdStatus={null}
          refresh={vi.fn(async () => ({
            servers: null,
            statuses: null,
            installationInfo: null,
            officialSteamBuild: null,
          }))}
          onOpenDownloads={vi.fn()}
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
          onCloneServer={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDeleteServer={vi.fn()}
        />
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

    renderOverview({ servers: [server, disabledServer] });

    await user.click(screen.getByRole("checkbox", { name: "Show disabled" }));
    expect(screen.getByText("Frozen Fjord")).toBeInTheDocument();
    expect(screen.getByText("The Island")).toBeInTheDocument();
  });

  it("keeps disabled-only fleets out of the enabled list until Show disabled is on", async () => {
    const user = userEvent.setup();
    const disabledOnly = { ...server, enabled: false };

    renderOverview({ servers: [disabledOnly] });

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

  it("disables Update All until a stopped server is eligible (#378)", () => {
    renderOverview({
      statuses: new Map([
        [
          "srv-1",
          {
            serverId: "srv-1",
            status: "stopped",
            processLive: false,
            pid: null,
            startedAt: null,
            lastError: null,
          },
        ],
      ]),
      installationInfo: new Map([[server.id, readyInstall()]]),
      officialSteamBuild: "build 111",
    });

    expect(screen.getByRole("button", { name: "Update All" })).toBeDisabled();
  });

  it("opens the update-all preview when the fleet action is enabled (#378)", async () => {
    const user = userEvent.setup();
    const install = readyInstall({ steamBuild: "build 111", build: "build 111" });
    const installationInfo = new Map([[server.id, install]]);
    const refresh = vi.fn(async () => ({
      servers: null,
      statuses: null,
      installationInfo,
      officialSteamBuild: "build 999",
    }));

    renderOverview({
      statuses: new Map([
        [
          "srv-1",
          {
            serverId: "srv-1",
            status: "stopped",
            processLive: false,
            pid: null,
            startedAt: null,
            lastError: null,
          },
        ],
      ]),
      installationInfo,
      officialSteamBuild: "build 999",
      refresh,
    });

    expect(screen.getByRole("button", { name: "Update All" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Update All" }));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: /^update all$/i })).toBeInTheDocument();
  });

  it("filters from the session-held search prop and reports changes via onSearchChange (#438)", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const secondServer = {
      ...server,
      id: "srv-2",
      name: "Scorched Earth",
      // Must override map: filterOverviewServers also matches map/clusterId,
      // and ...server would keep TheIsland_WP (still matches "Island").
      map: "ScorchedEarth_WP",
      installDir: "C:/ARK/ScorchedEarth",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    };

    renderOverview({
      servers: [server, secondServer],
      search: "Island",
      onSearchChange,
    });

    const searchBox = screen.getByRole("textbox", { name: "Search servers" });
    expect(searchBox).toHaveValue("Island");
    expect(screen.getByText("The Island")).toBeInTheDocument();
    expect(screen.queryByText("Scorched Earth")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("keeps search across Overview unmount when held above the page (#438)", async () => {
    const user = userEvent.setup();

    function SessionHeldOverview(): ReactElement {
      const [search, setSearch] = useState("");
      const [route, setRoute] = useState<"overview" | "other">("overview");
      return (
        <>
          <button type="button" onClick={() => setRoute("other")}>
            Leave Overview
          </button>
          <button type="button" onClick={() => setRoute("overview")}>
            Back to Overview
          </button>
          {route === "overview" ? (
            <OverviewPage
              search={search}
              onSearchChange={setSearch}
              onCreateServer={vi.fn()}
              onImportServer={vi.fn()}
              onCheckInstalls={vi.fn()}
              servers={[server]}
              statuses={new Map()}
              installationInfo={new Map()}
              playerListsByServer={new Map()}
              processMetricsByServer={new Map()}
              officialSteamBuild={null}
              events={[]}
              onViewAllActivity={vi.fn()}
              steamCmdStatus={null}
              refresh={vi.fn(async () => ({
                servers: null,
                statuses: null,
                installationInfo: null,
                officialSteamBuild: null,
              }))}
              onOpenDownloads={vi.fn()}
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
              onCloneServer={vi.fn()}
              onCopyConfiguration={vi.fn()}
              onDeleteServer={vi.fn()}
            />
          ) : (
            <div>Other route</div>
          )}
        </>
      );
    }

    render(
      <AppProviders>
        <SessionHeldOverview />
      </AppProviders>,
    );

    await user.type(screen.getByRole("textbox", { name: "Search servers" }), "Island");
    expect(screen.getByRole("textbox", { name: "Search servers" })).toHaveValue("Island");

    await user.click(screen.getByRole("button", { name: "Leave Overview" }));
    expect(screen.getByText("Other route")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Overview" }));
    expect(screen.getByRole("textbox", { name: "Search servers" })).toHaveValue("Island");
  });
});
