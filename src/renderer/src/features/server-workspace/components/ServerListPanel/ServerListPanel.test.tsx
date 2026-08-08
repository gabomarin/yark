import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
});
