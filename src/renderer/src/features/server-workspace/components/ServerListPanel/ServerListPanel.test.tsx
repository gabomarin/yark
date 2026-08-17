import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { ServerListPanel } from "./ServerListPanel";

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-1",
    name: "The Island",
    map: "TheIsland_WP",
    installDir: "C:\\ARK\\TheIsland",
    enabled: true,
    autoStart: false,
    sessionName: "YARK",
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
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("ServerListPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows map art thumbs for official and custom maps (#193)", () => {
    const statuses = new Map<string, ServerRuntimeInfo>();
    const { container } = render(
      <AppProviders>
        <ServerListPanel
          servers={[
            profile(),
            profile({
              id: "srv-2",
              name: "Svart",
              map: "Svartalfheim_WP",
              mapModId: "962796",
              modMetadataCache: {
                "962796": {
                  id: "962796",
                  name: "Svartalfheim Premium",
                  summary: "",
                  thumbnailUrl: "https://cdn.example/svart.png",
                  authors: [],
                  downloadCount: 0,
                  dateModified: "2026-01-01T00:00:00.000Z",
                  curseforgeUrl: "https://example.com",
                  slug: "svartalfheim-premium",
                  categories: ["Maps"],
                },
              },
            }),
          ]}
          selectedServerId="srv-1"
          statuses={statuses}
          onSelectServer={() => undefined}
        />
      </AppProviders>,
    );

    expect(screen.getByText("All servers")).toBeInTheDocument();
    const images = Array.from(container.querySelectorAll("img"));
    expect(images).toHaveLength(2);
    expect(images.some((img) => img.getAttribute("src") === "https://cdn.example/svart.png")).toBe(
      true,
    );
    expect(
      images.some((img) => {
        const src = img.getAttribute("src") ?? "";
        return /TheIsland_WP|theIsland|maps/i.test(src);
      }),
    ).toBe(true);
  });

  it("groups by cluster and uses status dots instead of badges (#107)", () => {
    render(
      <AppProviders>
        <ServerListPanel
          servers={[
            profile({ id: "a", name: "Island", clusterId: "Alpha" }),
            profile({ id: "b", name: "Scorched", clusterId: "Alpha", map: "ScorchedEarth_WP" }),
            profile({ id: "c", name: "Solo", clusterId: null }),
          ]}
          selectedServerId="a"
          statuses={new Map([["a", { status: "running" } as ServerRuntimeInfo]])}
          onSelectServer={() => undefined}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Unclustered")).toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.getByText("Island")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Island · TheIsland_WP · Running/i }),
    ).toBeInTheDocument();
  });

  it("sizes rail Add server by UI density (#233)", () => {
    const { rerender } = render(
      <AppProviders density="compact">
        <ServerListPanel
          servers={[profile()]}
          selectedServerId="srv-1"
          statuses={new Map()}
          iconMode
          onSelectServer={() => undefined}
          onAddServer={() => undefined}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: "Add server" })).toHaveAttribute(
      "data-size",
      "md",
    );

    rerender(
      <AppProviders density="comfortable">
        <ServerListPanel
          servers={[profile()]}
          selectedServerId="srv-1"
          statuses={new Map()}
          iconMode
          onSelectServer={() => undefined}
          onAddServer={() => undefined}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: "Add server" })).toHaveAttribute(
      "data-size",
      "lg",
    );
  });

  it("hides labels and exposes rail tooltips in icon mode (#107)", () => {
    render(
      <AppProviders>
        <ServerListPanel
          servers={[profile()]}
          selectedServerId="srv-1"
          statuses={new Map()}
          iconMode
          onSelectServer={() => undefined}
          onAddServer={() => undefined}
        />
      </AppProviders>,
    );

    expect(screen.queryByText("All servers")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search servers")).not.toBeInTheDocument();
    expect(screen.queryByText("The Island")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /The Island · TheIsland_WP · Stopped/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add server" })).toBeInTheDocument();
  });

  it("calls onToggleRail from the header control (#107)", async () => {
    const user = userEvent.setup();
    const onToggleRail = vi.fn();
    render(
      <AppProviders>
        <ServerListPanel
          servers={[profile()]}
          selectedServerId="srv-1"
          statuses={new Map()}
          onToggleRail={onToggleRail}
          onSelectServer={() => undefined}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Collapse to icon rail" }));
    expect(onToggleRail).toHaveBeenCalledTimes(1);
  });

  it("separates icon-rail clusters with dividers (#107)", () => {
    render(
      <AppProviders>
        <ServerListPanel
          servers={[
            profile({ id: "a", name: "Island", clusterId: "Alpha" }),
            profile({ id: "b", name: "Solo", clusterId: null }),
          ]}
          selectedServerId="a"
          statuses={new Map()}
          iconMode
          onSelectServer={() => undefined}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("group", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Unclustered" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Unclustered cluster" })).toBeInTheDocument();
  });

  it("keeps the selected server visible when its cluster would collapse (#107)", () => {
    render(
      <AppProviders>
        <ServerListPanel
          servers={[
            profile({ id: "a", name: "Island", clusterId: "Alpha" }),
            profile({ id: "b", name: "Scorched", clusterId: "Alpha", map: "ScorchedEarth_WP" }),
            profile({ id: "c", name: "Solo", clusterId: null }),
          ]}
          selectedServerId="a"
          statuses={new Map()}
          onSelectServer={() => undefined}
        />
      </AppProviders>,
    );

    const alphaHeader = screen.getByRole("button", { name: /^Alpha\s*2$/i });
    alphaHeader.click();
    expect(screen.getByText("Island")).toBeInTheDocument();
  });
});
