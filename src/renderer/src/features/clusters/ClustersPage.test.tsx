import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type {
  ClusterComplianceReport,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { ClustersPage } from "./ClustersPage";

function makeServer(overrides: Partial<ServerProfile> & Pick<ServerProfile, "id" | "name">): ServerProfile {
  const { enabled, ...rest } = overrides;
  return {
    map: "TheIsland_WP",
    installDir: `C:/ARK/${overrides.id}`,
    sessionName: overrides.name,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: "alpha",
    clusterDir: "C:/ARK/cluster",
    extraArgs: [],
    mods: [],
    enabled: enabled ?? true,
    autoStart: false,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...rest,
  };
}

function makeStatuses(
  entries: Array<[string, ServerRuntimeInfo["status"]]> = [],
): Map<string, ServerRuntimeInfo> {
  return new Map(
    entries.map(([serverId, status]) => [
      serverId,
      { serverId, status, pid: null, startedAt: null, lastError: null },
    ]),
  );
}

const island = makeServer({ id: "srv-a", name: "The Island", gamePort: 7777, queryPort: 27015, rconPort: 27020 });
const scorched = makeServer({
  id: "srv-b",
  name: "Scorched",
  map: "ScorchedEarth_WP",
  gamePort: 7779,
  queryPort: 27017,
  rconPort: 27022,
});

const readyReport: ClusterComplianceReport = {
  clusterId: "alpha",
  ok: true,
  members: ["srv-a", "srv-b"],
  issues: [],
  checkedAt: "2026-07-26T09:00:00.000Z",
};

const brokenReport: ClusterComplianceReport = {
  clusterId: "beta",
  ok: false,
  members: ["srv-c"],
  issues: [
    {
      serverId: "srv-c",
      severity: "error",
      message: '"Solo" has no cluster directory configured',
    },
  ],
  checkedAt: "2026-07-26T09:00:00.000Z",
};

const solo = makeServer({
  id: "srv-c",
  name: "Solo",
  clusterId: "beta",
  clusterDir: null,
  gamePort: 7781,
  queryPort: 27019,
  rconPort: 27024,
});

describe("ClustersPage", () => {
  afterEach(cleanup);

  it("shows empty guidance when no clusters exist", () => {
    render(
      <AppProviders>
        <ClustersPage
          servers={[makeServer({ id: "lone", name: "Lone", clusterId: null, clusterDir: null })]}
          reports={[]}
          statuses={makeStatuses()}
          onOpenServer={vi.fn()}
          onRefresh={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Clusters")).toBeInTheDocument();
    expect(screen.getByText("No clusters configured")).toBeInTheDocument();
    expect(screen.getByText("How transfers work here")).toBeInTheDocument();
    expect(document.querySelector("[data-clusters-page]")).toBeInTheDocument();
  });

  it("lists compliance reports and opens a member server", async () => {
    const user = userEvent.setup();
    const onOpenServer = vi.fn();

    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched, solo]}
          reports={[readyReport, brokenReport]}
          statuses={makeStatuses()}
          onOpenServer={onOpenServer}
          onRefresh={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("2 clusters")).toBeInTheDocument();
    expect(screen.getByText("1 with errors")).toBeInTheDocument();

    // Broken clusters sort first — detail should show beta's error.
    expect(screen.getByText(/no cluster directory configured/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /alpha/i }));
    await user.click(screen.getByRole("button", { name: /The Island/i }));
    expect(onOpenServer).toHaveBeenCalledWith("srv-a");
  });

  it("calls onRefresh when the Clusters view opens", () => {
    const onRefresh = vi.fn();

    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched]}
          reports={[readyReport]}
          statuses={makeStatuses()}
          onOpenServer={vi.fn()}
          onRefresh={onRefresh}
        />
      </AppProviders>,
    );

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /recheck/i })).not.toBeInTheDocument();
  });

  it("labels disabled cluster members as inactive", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <ClustersPage
          servers={[{ ...island, enabled: false }, scorched]}
          reports={[readyReport]}
          statuses={makeStatuses()}
          onOpenServer={vi.fn()}
          onRefresh={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /alpha/i }));
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("explains when servers have clusterDir but no clusterId", () => {
    render(
      <AppProviders>
        <ClustersPage
          servers={[
            makeServer({
              id: "dir-only",
              name: "Dir Only",
              clusterId: null,
              clusterDir: "C:/ARK/cluster",
            }),
          ]}
          reports={[]}
          statuses={makeStatuses()}
          onOpenServer={vi.fn()}
          onRefresh={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getAllByText(/directory but no Cluster ID/i).length).toBeGreaterThan(0);
    expect(screen.getByText("C:/ARK/cluster")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dir Only/i })).toBeInTheDocument();
    expect(screen.getByText(/missing Cluster ID/i)).toBeInTheDocument();
  });

  it("creates a cluster from multiple eligible stopped servers", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const islandMap = makeServer({
      id: "island",
      name: "Island Map",
      clusterId: null,
      clusterDir: null,
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
    });
    const scorchedMap = makeServer({
      id: "scorched",
      name: "Scorched Map",
      map: "ScorchedEarth_WP",
      clusterId: null,
      clusterDir: null,
      gamePort: 7779,
      queryPort: 27017,
      rconPort: 27022,
    });
    const updateServer = vi.fn().mockImplementation(async (id: string, input: unknown) => ({
      ok: true,
      data: {
        ...(id === "island" ? islandMap : scorchedMap),
        ...(input as object),
      },
    }));
    const pickPath = vi.fn().mockResolvedValue({
      ok: true,
      data: "D:\\ASA\\Clusters\\Ember",
    });
    window.api = {
      ...window.api,
      updateServer,
      pickPath,
    };

    render(
      <AppProviders>
        <ClustersPage
          servers={[islandMap, scorchedMap]}
          reports={[]}
          statuses={makeStatuses([
            ["island", "stopped"],
            ["scorched", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={onRefresh}
        />
      </AppProviders>,
    );

    await user.click(screen.getAllByRole("button", { name: /create cluster/i })[0]!);
    const dialog = await screen.findByRole("dialog", { name: /create cluster/i });
    expect(within(dialog).getByText("Island Map")).toBeInTheDocument();
    // First eligible is preselected; toggle the second map in.
    await user.click(within(dialog).getByRole("button", { name: /Scorched Map/i }));
    expect(within(dialog).getByText(/2 selected/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /continue/i }));
    await user.clear(within(dialog).getByLabelText(/cluster id/i));
    await user.type(within(dialog).getByLabelText(/cluster id/i), "ember-nexus-1000");
    await user.click(within(dialog).getByRole("button", { name: /browse/i }));
    await user.click(within(dialog).getByRole("button", { name: /continue/i }));
    expect(within(dialog).getByText("Island Map")).toBeInTheDocument();
    expect(within(dialog).getByText("Scorched Map")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^create cluster$/i }));

    expect(updateServer).toHaveBeenCalledTimes(2);
    expect(updateServer).toHaveBeenCalledWith(
      "island",
      expect.objectContaining({
        clusterId: "ember-nexus-1000",
        clusterDir: "D:\\ASA\\Clusters\\Ember",
      }),
    );
    expect(updateServer).toHaveBeenCalledWith(
      "scorched",
      expect.objectContaining({
        clusterId: "ember-nexus-1000",
        clusterDir: "D:\\ASA\\Clusters\\Ember",
      }),
    );
    // Mount refresh + post-create refresh.
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("rolls back earlier servers when a later create update fails", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const islandMap = makeServer({
      id: "island",
      name: "Island Map",
      clusterId: null,
      clusterDir: null,
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
    });
    const scorchedMap = makeServer({
      id: "scorched",
      name: "Scorched Map",
      map: "ScorchedEarth_WP",
      clusterId: null,
      clusterDir: null,
      gamePort: 7779,
      queryPort: 27017,
      rconPort: 27022,
    });
    const updateServer = vi.fn().mockImplementation(async (id: string, input: unknown) => {
      const payload = input as { clusterId?: string | null };
      if (id === "scorched" && payload.clusterId === "ember-nexus-1000") {
        return { ok: false, error: "Disk full" };
      }
      return {
        ok: true,
        data: {
          ...(id === "island" ? islandMap : scorchedMap),
          ...(input as object),
        },
      };
    });
    const pickPath = vi.fn().mockResolvedValue({
      ok: true,
      data: "D:\\ASA\\Clusters\\Ember",
    });
    window.api = {
      ...window.api,
      updateServer,
      pickPath,
    };

    render(
      <AppProviders>
        <ClustersPage
          servers={[islandMap, scorchedMap]}
          reports={[]}
          statuses={makeStatuses([
            ["island", "stopped"],
            ["scorched", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={onRefresh}
        />
      </AppProviders>,
    );

    await user.click(screen.getAllByRole("button", { name: /create cluster/i })[0]!);
    const dialog = await screen.findByRole("dialog", { name: /create cluster/i });
    await user.click(within(dialog).getByRole("button", { name: /Scorched Map/i }));
    await user.click(within(dialog).getByRole("button", { name: /continue/i }));
    await user.clear(within(dialog).getByLabelText(/cluster id/i));
    await user.type(within(dialog).getByLabelText(/cluster id/i), "ember-nexus-1000");
    await user.click(within(dialog).getByRole("button", { name: /browse/i }));
    await user.click(within(dialog).getByRole("button", { name: /continue/i }));
    await user.click(within(dialog).getByRole("button", { name: /^create cluster$/i }));

    expect(await within(dialog).findByText(/Previous profiles were restored/i)).toBeInTheDocument();
    expect(updateServer).toHaveBeenCalledWith(
      "island",
      expect.objectContaining({
        clusterId: null,
        clusterDir: null,
      }),
    );
    // Mount only — successful rollback should not refresh as a partial cluster.
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
