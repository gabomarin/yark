import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    maxPlayers: 70,
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
      { serverId, status, processLive: status !== "stopped" && status !== "error", pid: null, startedAt: null, lastError: null },
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

  beforeEach(() => {
    window.api = {
      ...(window.api ?? {}),
      getClusterIniTemplate: vi.fn(async () => ({ ok: true, data: null })),
      getClusterIniTemplateOrDraft: vi.fn(async (clusterId: string) => ({
        ok: true,
        data: {
          clusterId,
          payload: { gameUserSettings: "", game: "" },
          updatedAt: "2026-08-05T00:00:00.000Z",
        },
      })),
      previewClusterIniTemplate: vi.fn(async () => ({
        ok: true,
        data: { valid: true, issues: [], diff: [], changedCount: 0 },
      })),
      saveClusterIniTemplate: vi.fn(async (clusterId: string, payload) => ({
        ok: true,
        data: {
          template: {
            clusterId,
            payload,
            updatedAt: "2026-08-05T00:00:00.000Z",
          },
          preview: { valid: true, issues: [], diff: [], changedCount: 1 },
        },
      })),
      deleteClusterIniTemplate: vi.fn(async () => ({ ok: true, data: true })),
      previewClusterIniRestore: vi.fn(async () => ({
        ok: true,
        data: {
          operation: "restore" as const,
          clusterId: "alpha",
          serverId: "srv-a",
          serverName: "The Island",
          files: { gameUserSettings: true, game: true },
          preview: {
            valid: true,
            issues: [],
            diff: [
              {
                fileKey: "gameUserSettings" as const,
                section: "ServerSettings",
                key: "XPMultiplier",
                before: "1",
                after: "3",
                change: "changed" as const,
              },
            ],
            changedCount: 1,
          },
        },
      })),
      previewClusterIniPromote: vi.fn(async () => ({
        ok: true,
        data: {
          operation: "promote" as const,
          clusterId: "alpha",
          serverId: "srv-a",
          serverName: "The Island",
          files: { gameUserSettings: true, game: true },
          preview: {
            valid: true,
            issues: [],
            diff: [
              {
                fileKey: "gameUserSettings" as const,
                section: "ServerSettings",
                key: "MaxPlayers",
                before: "40",
                after: "20",
                change: "changed" as const,
              },
            ],
            changedCount: 1,
          },
        },
      })),
      previewClusterIniSeed: vi.fn(),
      restoreClusterIniFromTemplate: vi.fn(async () => ({
        ok: true,
        data: {
          operation: "restore" as const,
          clusterId: "alpha",
          serverId: "srv-a",
          files: { gameUserSettings: true, game: true },
          preview: { valid: true, issues: [], diff: [], changedCount: 1 },
          template: {
            clusterId: "alpha",
            payload: { gameUserSettings: "", game: "" },
            updatedAt: "2026-08-05T00:00:00.000Z",
          },
          backupId: null,
          snapshotDir: "C:/snap",
        },
      })),
      promoteClusterIniToTemplate: vi.fn(async () => ({
        ok: true,
        data: {
          operation: "promote" as const,
          clusterId: "alpha",
          serverId: "srv-a",
          files: { gameUserSettings: true, game: true },
          preview: { valid: true, issues: [], diff: [], changedCount: 1 },
          template: {
            clusterId: "alpha",
            payload: { gameUserSettings: "", game: "" },
            updatedAt: "2026-08-05T00:00:00.000Z",
          },
          backupId: null,
          snapshotDir: null,
        },
      })),
      seedClusterIniFromTemplate: vi.fn(async () => ({
        ok: true,
        data: {
          operation: "seed" as const,
          clusterId: "alpha",
          serverId: "free",
          files: { gameUserSettings: true, game: true },
          preview: { valid: true, issues: [], diff: [], changedCount: 1 },
          template: {
            clusterId: "alpha",
            payload: { gameUserSettings: "", game: "" },
            updatedAt: "2026-08-05T00:00:00.000Z",
          },
          backupId: null,
          snapshotDir: "C:/snap",
        },
      })),
    } as typeof window.api;
  });

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
    expect(screen.getByText("How transfers work")).toBeInTheDocument();
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

    expect(screen.getByText(/2 clusters · 1 ready · 1 with errors/)).toBeInTheDocument();

    // Broken clusters sort first — detail should show beta's error.
    expect(screen.getByText(/no cluster directory configured/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /alpha/i }));
    const detail = document.querySelector('[data-cluster-detail="alpha"]');
    expect(detail).not.toBeNull();
    const islandLabel = within(detail as HTMLElement).getByText("The Island");
    const islandRow = islandLabel.closest("[class*='memberRow']");
    expect(islandRow).not.toBeNull();
    await user.click(islandRow as HTMLElement);
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
    expect(
      screen.getByRole("textbox", { name: /incomplete cluster directory/i }),
    ).toHaveTextContent("C:/ARK/cluster");
    expect(screen.getByText("Dir Only")).toBeInTheDocument();
    expect(screen.getByLabelText(/^open /i)).toBeInTheDocument();
    expect(screen.getByText(/missing Cluster ID/i)).toBeInTheDocument();
  });

  it("shows incomplete cluster directories as readonly path chips when creating a cluster", async () => {
    const user = userEvent.setup();
    const eligible = makeServer({
      id: "eligible",
      name: "Eligible Map",
      clusterId: null,
      clusterDir: null,
    });
    const dirOnly = makeServer({
      id: "dir-only",
      name: "Dir Only",
      clusterId: null,
      clusterDir: "C:/ARK/cluster",
    });

    render(
      <AppProviders>
        <ClustersPage
          servers={[eligible, dirOnly]}
          reports={[]}
          statuses={makeStatuses([
            ["eligible", "stopped"],
            ["dir-only", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getAllByRole("button", { name: /create cluster/i })[0]!);
    const dialog = await screen.findByRole("dialog", { name: /create cluster/i });
    await user.click(within(dialog).getByRole("button", { name: /continue/i }));
    expect(within(dialog).getByText(/Incomplete setups/i)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: /incomplete cluster directory/i }),
    ).toHaveTextContent("C:/ARK/cluster");
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
    expect(
      within(dialog).getByRole("textbox", { name: /shared cluster directory/i }),
    ).toHaveTextContent("D:\\ASA\\Clusters\\Ember");
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

  it("adds a stopped unclustered server to an existing cluster", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const free = makeServer({
      id: "free",
      name: "Free Map",
      clusterId: null,
      clusterDir: null,
      gamePort: 7783,
      queryPort: 27021,
      rconPort: 27026,
    });
    const updateServer = vi.fn().mockImplementation(async (id: string, input: unknown) => ({
      ok: true,
      data: {
        ...(id === "free" ? free : island),
        ...(input as object),
      },
    }));
    window.api = {
      ...window.api,
      updateServer,
    };

    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched, free]}
          reports={[readyReport]}
          statuses={makeStatuses([
            ["srv-a", "stopped"],
            ["srv-b", "stopped"],
            ["free", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={onRefresh}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /add servers/i }));
    const dialog = await screen.findByRole("dialog", { name: /add servers to alpha/i });
    expect(within(dialog).getByText("Free Map")).toBeInTheDocument();
    expect(within(dialog).queryByText("The Island")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Scorched")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /continue/i })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: /Free Map/i }));
    expect(within(dialog).getByText(/1 selected/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /continue/i }));
    expect(
      within(dialog).getByRole("textbox", { name: /shared cluster directory/i }),
    ).toHaveTextContent(/C:[\\/]ARK[\\/]cluster/i);
    await user.click(within(dialog).getByRole("button", { name: /add to cluster/i }));

    expect(updateServer).toHaveBeenCalledWith(
      "free",
      expect.objectContaining({
        clusterId: "alpha",
        clusterDir: expect.stringMatching(/C:[\\/]ARK[\\/]cluster/i),
      }),
    );
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("removes a stopped member from the cluster", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const updateServer = vi.fn().mockResolvedValue({
      ok: true,
      data: { ...island, clusterId: null, clusterDir: null },
    });
    window.api = {
      ...window.api,
      updateServer,
    };

    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched]}
          reports={[readyReport]}
          statuses={makeStatuses([
            ["srv-a", "stopped"],
            ["srv-b", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={onRefresh}
        />
      </AppProviders>,
    );

    const removeButtons = screen.getAllByRole("button", { name: /^remove /i });
    await user.click(removeButtons[0]!);
    const dialog = await screen.findByRole("dialog", { name: /remove from alpha/i });
    await user.click(within(dialog).getByRole("button", { name: /remove from cluster/i }));

    expect(updateServer).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        clusterId: null,
        clusterDir: null,
      }),
    );
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("opens the cluster INI template editor from detail", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched]}
          reports={[readyReport]}
          statuses={makeStatuses([
            ["srv-a", "stopped"],
            ["srv-b", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /create ini template/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/cluster ini template/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/^alpha$/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/session name, ports, and passwords stay per-server/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("radiogroup", { name: /ini file/i })).toBeInTheDocument();
    expect(window.api.getClusterIniTemplateOrDraft).toHaveBeenCalledWith("alpha");
  });

  it("shows Restore INI disabled until a cluster template exists", async () => {
    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched]}
          reports={[readyReport]}
          statuses={makeStatuses([
            ["srv-a", "stopped"],
            ["srv-b", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={vi.fn()}
        />
      </AppProviders>,
    );

    const restore = await screen.findByRole("button", {
      name: /restore the island from template/i,
    });
    expect(restore).toBeDisabled();
  });

  it("promotes a stopped member into the cluster template after confirmation", async () => {
    const user = userEvent.setup();
    window.api = {
      ...window.api,
      getClusterIniTemplate: vi.fn(async () => ({
        ok: true,
        data: {
          clusterId: "alpha",
          payload: { gameUserSettings: "[ServerSettings]\nXPMultiplier=3\n", game: "" },
          updatedAt: "2026-08-05T00:00:00.000Z",
        },
      })),
    } as typeof window.api;

    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched]}
          reports={[readyReport]}
          statuses={makeStatuses([
            ["srv-a", "stopped"],
            ["srv-b", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(
      await screen.findByRole("button", { name: /promote the island to template/i }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/promote member to template/i)).toBeInTheDocument();
    expect(await within(dialog).findByText(/MaxPlayers/i)).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /promote to template/i }),
    );
    expect(window.api.promoteClusterIniToTemplate).toHaveBeenCalledWith(
      "alpha",
      "srv-a",
      { gameUserSettings: true, game: true },
    );
  });

  it("restores a stopped member from the cluster template after confirmation", async () => {
    const user = userEvent.setup();
    window.api = {
      ...window.api,
      getClusterIniTemplate: vi.fn(async () => ({
        ok: true,
        data: {
          clusterId: "alpha",
          payload: { gameUserSettings: "[ServerSettings]\nXPMultiplier=3\n", game: "" },
          updatedAt: "2026-08-05T00:00:00.000Z",
        },
      })),
    } as typeof window.api;

    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched]}
          reports={[readyReport]}
          statuses={makeStatuses([
            ["srv-a", "stopped"],
            ["srv-b", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(
      await screen.findByRole("button", { name: /restore the island from template/i }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/restore member from template/i)).toBeInTheDocument();
    expect(await within(dialog).findByText(/XPMultiplier/i)).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /restore & backup/i }),
    );
    expect(window.api.restoreClusterIniFromTemplate).toHaveBeenCalledWith(
      "alpha",
      "srv-a",
      { gameUserSettings: true, game: true },
    );
  });

  it("seeds INI from the template only after explicit Seed INI opt-in", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const free = makeServer({
      id: "free",
      name: "Free Map",
      clusterId: null,
      clusterDir: null,
      gamePort: 7783,
      queryPort: 27021,
      rconPort: 27026,
    });
    const updateServer = vi.fn().mockImplementation(async (id: string, input: unknown) => ({
      ok: true,
      data: {
        ...(id === "free" ? free : island),
        ...(input as object),
      },
    }));
    window.api = {
      ...window.api,
      updateServer,
      getClusterIniTemplate: vi.fn(async () => ({
        ok: true,
        data: {
          clusterId: "alpha",
          payload: { gameUserSettings: "", game: "" },
          updatedAt: "2026-08-05T00:00:00.000Z",
        },
      })),
    } as typeof window.api;

    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched, free]}
          reports={[readyReport]}
          statuses={makeStatuses([
            ["srv-a", "stopped"],
            ["srv-b", "stopped"],
            ["free", "stopped"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={onRefresh}
        />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("button", { name: /^add servers$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Free Map/i }));
    await user.click(within(dialog).getByRole("button", { name: /continue/i }));
    const seedToggle = within(dialog).getByRole("checkbox", {
      name: /seed ini from cluster template/i,
    });
    expect(seedToggle).not.toBeChecked();
    expect(window.api.seedClusterIniFromTemplate).not.toHaveBeenCalled();

    await user.click(seedToggle);
    expect(seedToggle).toBeChecked();
    const gus = within(dialog).getByRole("checkbox", {
      name: /gameusersettings\.ini/i,
    });
    const game = within(dialog).getByRole("checkbox", { name: /^game\.ini$/i });
    expect(gus).not.toBeChecked();
    expect(game).not.toBeChecked();
    expect(within(dialog).getByRole("button", { name: /add to cluster/i })).toBeDisabled();

    await user.click(gus);
    await user.click(game);
    await user.click(within(dialog).getByRole("button", { name: /add to cluster/i }));

    expect(updateServer).toHaveBeenCalled();
    expect(window.api.seedClusterIniFromTemplate).toHaveBeenCalledWith(
      "alpha",
      "free",
      { gameUserSettings: true, game: true },
    );
    expect(onRefresh).toHaveBeenCalled();
  });

  it("allows an Error-state idle server to join a cluster without seeding", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const free = makeServer({
      id: "free",
      name: "Free Map",
      clusterId: null,
      clusterDir: null,
      gamePort: 7783,
      queryPort: 27021,
      rconPort: 27026,
    });
    const updateServer = vi.fn().mockImplementation(async (id: string, input: unknown) => ({
      ok: true,
      data: {
        ...(id === "free" ? free : island),
        ...(input as object),
      },
    }));
    window.api = {
      ...window.api,
      updateServer,
    };

    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched, free]}
          reports={[readyReport]}
          statuses={makeStatuses([
            ["srv-a", "stopped"],
            ["srv-b", "stopped"],
            ["free", "error"],
          ])}
          onOpenServer={vi.fn()}
          onRefresh={onRefresh}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /add servers/i }));
    const dialog = await screen.findByRole("dialog", { name: /add servers to alpha/i });
    expect(within(dialog).getByText("Free Map")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Free Map/i }));
    await user.click(within(dialog).getByRole("button", { name: /continue/i }));
    await user.click(within(dialog).getByRole("button", { name: /add to cluster/i }));

    expect(updateServer).toHaveBeenCalledWith(
      "free",
      expect.objectContaining({
        clusterId: "alpha",
        clusterDir: expect.stringMatching(/C:[\\/]ARK[\\/]cluster/i),
      }),
    );
    expect(window.api.seedClusterIniFromTemplate).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalled();
  });
});
