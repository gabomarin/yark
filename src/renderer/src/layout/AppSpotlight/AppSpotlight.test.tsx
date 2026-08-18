import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spotlight } from "@mantine/spotlight";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile } from "@shared/types";
import { AppSpotlight } from "./AppSpotlight";
import {
  sortServersForSpotlight,
  SPOTLIGHT_NAV_ITEMS,
} from "./appSpotlightModel";
import {
  resetSpotlightRecentCacheForTests,
  SPOTLIGHT_RECENT_STORAGE_KEY,
  writeSpotlightRecent,
} from "./appSpotlightRecent";

afterEach(() => {
  cleanup();
  spotlight.close();
  window.localStorage.removeItem(SPOTLIGHT_RECENT_STORAGE_KEY);
  resetSpotlightRecentCacheForTests();
});

const server: ServerProfile = {
  id: "srv-1",
  name: "Gabo Scorched",
  map: "ScorchedEarth_WP",
  installDir: "C:/ARK/Scorched",
  enabled: true,
  autoStart: false,
  sessionName: "Scorched Cluster",
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

describe("appSpotlightModel", () => {
  it("lists navigate items with sidebar icons and sorts servers A→Z", () => {
    expect(SPOTLIGHT_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Servers",
      "Downloads",
      "Clusters",
      "Backups",
      "Logs",
      "Settings",
    ]);
    expect(SPOTLIGHT_NAV_ITEMS.every((item) => item.icon != null)).toBe(true);

    const sorted = sortServersForSpotlight([
      { ...server, id: "b", name: "Zebra" },
      { ...server, id: "a", name: "Alpha" },
    ]);
    expect(sorted.map((row) => row.name)).toEqual(["Alpha", "Zebra"]);
  });
});

describe("AppSpotlight", () => {
  it("shows navigate icons and map thumbs, and runs actions", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onOpenServer = vi.fn();

    render(
      <AppProviders>
        <AppSpotlight
          servers={[server]}
          onNavigate={onNavigate}
          onOpenServer={onOpenServer}
        />
      </AppProviders>,
    );

    spotlight.open();
    expect(
      await screen.findByPlaceholderText("Jump to page or server…"),
    ).toBeInTheDocument();

    const settings = screen.getByRole("button", { name: /Settings/i });
    expect(settings.querySelector("svg")).toBeTruthy();

    const serverAction = screen.getByRole("button", { name: /Gabo Scorched/i });
    expect(
      serverAction.querySelector("img") ?? serverAction.querySelector("svg"),
    ).toBeTruthy();

    await user.click(settings);
    expect(onNavigate).toHaveBeenCalledWith("settings");

    spotlight.open();
    await user.click(
      await screen.findByRole("button", { name: /Gabo Scorched/i }),
    );
    expect(onOpenServer).toHaveBeenCalledWith("srv-1");
  });

  it("shows a Recent group for stored nav and server jumps", async () => {
    writeSpotlightRecent([
      { kind: "nav", route: "backups" },
      { kind: "server", serverId: "srv-1" },
    ]);
    resetSpotlightRecentCacheForTests();

    render(
      <AppProviders>
        <AppSpotlight
          servers={[server]}
          onNavigate={vi.fn()}
          onOpenServer={vi.fn()}
        />
      </AppProviders>,
    );

    spotlight.open();
    expect(await screen.findByText("Recent")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Backups/i }).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      screen.getAllByRole("button", { name: /Gabo Scorched/i }).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
