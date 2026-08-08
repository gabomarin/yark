import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile } from "@shared/types";
import { ServerLaunchPanel } from "./ServerLaunchPanel";

function profile(partial: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-a",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\ark\\a",
    sessionName: "Island",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    structuredLaunchArgs: {},
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

describe("ServerLaunchPanel", () => {
  beforeEach(() => {
    window.api = {
      ...(window.api ?? {}),
      updateServer: vi.fn(async () => ({ ok: true as const, data: profile() })),
    } as typeof window.api;
  });

  it("renders common structured options and opens the catalog (#93)", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <ServerLaunchPanel server={profile()} onServerUpdated={vi.fn()} />
      </AppProviders>,
    );

    expect(screen.getByTestId("server-launch-panel")).toBeInTheDocument();
    expect(screen.getByText(/world & gameplay/i)).toBeInTheDocument();
    expect(screen.queryByText(/cluster edge/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^extra arguments$/i)).toBeInTheDocument();
    expect(screen.getByText(/ForceAllowCaveFlyers/i)).toBeInTheDocument();
    expect(screen.getByText(/passivemods/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /browse asa catalog/i }));
    expect(
      await screen.findByRole("dialog", { name: /asa launch-options catalog/i }),
    ).toBeInTheDocument();
  });

  it("keeps tribe-log dependents disabled until parents are on (#93)", () => {
    render(
      <AppProviders>
        <ServerLaunchPanel server={profile()} onServerUpdated={vi.fn()} />
      </AppProviders>,
    );

    expect(
      screen.getByLabelText(/enable -servergamelogincludetribelogs/i),
    ).toBeDisabled();
    expect(
      screen.getByLabelText(/enable -serverrconoutputtribelogs/i),
    ).toBeDisabled();
  });

  it("warns when custom map mod is disabled (#194)", () => {
    render(
      <AppProviders>
        <ServerLaunchPanel
          server={profile({
            map: "Svartalfheim_WP",
            mapModId: "962796",
            mods: ["962796"],
            disabledMods: ["962796"],
          })}
          onServerUpdated={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/custom map mod inconsistent/i)).toBeInTheDocument();
    expect(
      screen.getByText(/disabled and will be omitted from -mods=/i),
    ).toBeInTheDocument();
  });

  it("shows inline caution on ForceRespawnDinos when enabled (#93)", () => {
    render(
      <AppProviders>
        <ServerLaunchPanel
          server={profile({
            structuredLaunchArgs: {
              forcerespawndinos: { enabled: true },
            },
          })}
          onServerUpdated={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.queryByText(/sticky launch flags enabled/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/wipes wild dinos on every start/i),
    ).toBeInTheDocument();
  });

  it("exposes option descriptions on a keyboard-focusable label (#93)", () => {
    render(
      <AppProviders>
        <ServerLaunchPanel server={profile()} onServerUpdated={vi.fn()} />
      </AppProviders>,
    );

    const label = screen.getByText("-NoBattlEye");
    expect(label.tabIndex).toBe(0);
  });
});
