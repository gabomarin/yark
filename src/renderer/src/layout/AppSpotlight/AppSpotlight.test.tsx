import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spotlight } from "@mantine/spotlight";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile } from "@shared/types";
import { AppSpotlight } from "./AppSpotlight";
import { buildSpotlightActions } from "./appSpotlightModel";

afterEach(() => {
  cleanup();
  spotlight.close();
});

const server: ServerProfile = {
  id: "srv-1",
  name: "Gabo Scorched",
  map: "ScorchedEarth_WP",
  installDir: "C:/ARK/Scorched",
  enabled: true,
  autoStart: false,
  sessionName: "Scorched Cluster",
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

describe("buildSpotlightActions", () => {
  it("includes navigate routes and server jump actions", () => {
    const onNavigate = vi.fn();
    const onOpenServer = vi.fn();
    const groups = buildSpotlightActions([server], { onNavigate, onOpenServer });

    expect(groups).toHaveLength(2);
    const navigate = groups[0]!;
    const servers = groups[1]!;
    expect("group" in navigate && navigate.group).toBe("Navigate");
    expect("group" in servers && servers.group).toBe("Servers");
    if (!("actions" in navigate) || !("actions" in servers)) {
      throw new Error("expected action groups");
    }
    expect(navigate.actions.map((a) => a.label)).toEqual([
      "Servers",
      "Clusters",
      "Backups",
      "Logs",
      "Settings",
    ]);
    expect(servers.actions[0]?.label).toBe("Gabo Scorched");

    navigate.actions.find((a) => a.id === "nav:settings")?.onClick?.({} as never);
    expect(onNavigate).toHaveBeenCalledWith("settings");

    servers.actions[0]?.onClick?.({} as never);
    expect(onOpenServer).toHaveBeenCalledWith("srv-1");
  });
});

describe("AppSpotlight", () => {
  it("opens via spotlight API and runs a navigate action", async () => {
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

    await user.click(screen.getByRole("button", { name: /Settings/i }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("opens a server workspace from the Servers group", async () => {
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
    await user.click(
      await screen.findByRole("button", { name: /Gabo Scorched/i }),
    );
    expect(onOpenServer).toHaveBeenCalledWith("srv-1");
  });
});
