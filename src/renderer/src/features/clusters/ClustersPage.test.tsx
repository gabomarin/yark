import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ClusterComplianceReport, ServerProfile } from "@shared/types";
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

  it("calls onRefresh from Recheck", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(
      <AppProviders>
        <ClustersPage
          servers={[island, scorched]}
          reports={[readyReport]}
          onOpenServer={vi.fn()}
          onRefresh={onRefresh}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /recheck/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("labels disabled cluster members as inactive", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <ClustersPage
          servers={[{ ...island, enabled: false }, scorched]}
          reports={[readyReport]}
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
});
