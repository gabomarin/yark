import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile } from "@shared/types";
import { ServerFormPortConflictAlert } from "./ServerFormPortConflictAlert";

function profile(partial: Partial<ServerProfile> & Pick<ServerProfile, "id" | "name">): ServerProfile {
  return {
    map: "TheIsland_WP",
    installDir: "C:\\ark\\a",
    sessionName: partial.name,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    disabledMods: [],
    modMetadataCache: {},
    autoStart: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("ServerFormPortConflictAlert", () => {
  const fleet = [
    profile({
      id: "srv-a",
      name: "The Island",
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
    }),
  ];

  it("shows conflicts for valid overlapping ports (#178)", () => {
    render(
      <AppProviders>
        <ServerFormPortConflictAlert
          servers={fleet}
          name="New"
          gamePort="7777"
          queryPort="27015"
          rconPort="27020"
        />
      </AppProviders>,
    );

    expect(screen.getByText(/port conflicts/i)).toBeInTheDocument();
  });

  it("hides preview for empty or out-of-range ports (#178)", () => {
    const { rerender } = render(
      <AppProviders>
        <ServerFormPortConflictAlert
          servers={fleet}
          name="New"
          gamePort=""
          queryPort="27015"
          rconPort="27020"
        />
      </AppProviders>,
    );
    expect(screen.queryByText(/port conflicts/i)).not.toBeInTheDocument();

    rerender(
      <AppProviders>
        <ServerFormPortConflictAlert
          servers={fleet}
          name="New"
          gamePort="80"
          queryPort="27015"
          rconPort="27020"
        />
      </AppProviders>,
    );
    expect(screen.queryByText(/port conflicts/i)).not.toBeInTheDocument();
  });
});
