import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile } from "@shared/types";
import { CopyConfigDoneStep } from "./CopyConfigDoneStep";

function profile(partial: Partial<ServerProfile> & Pick<ServerProfile, "id" | "name">): ServerProfile {
  return {
    map: "TheIsland_WP",
    installDir: `C:\\ark\\${partial.name}`,
    sessionName: partial.name,
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
    disabledMods: [],
    modMetadataCache: {},
    autoStart: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

const source = profile({ id: "src", name: "Source" });
const target = profile({ id: "tgt", name: "Target", gamePort: 7787, queryPort: 27025, rconPort: 27030 });

describe("CopyConfigDoneStep (#240)", () => {
  it("shows success as plain text without a teal Done Alert", () => {
    render(
      <AppProviders>
        <CopyConfigDoneStep
          sourceName={source.name}
          servers={[source, target]}
          outcomes={[
            {
              targetId: target.id,
              targetName: target.name,
              ok: true,
            },
          ]}
          onClose={vi.fn()}
          onCompleted={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/Copied settings to Target/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert", { name: /^done$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open target/i })).toBeInTheDocument();
  });

  it("keeps a failure Alert when some targets fail", () => {
    render(
      <AppProviders>
        <CopyConfigDoneStep
          sourceName={source.name}
          servers={[source, target]}
          outcomes={[
            {
              targetId: target.id,
              targetName: target.name,
              ok: false,
              error: "Fingerprint mismatch",
            },
          ]}
          onClose={vi.fn()}
          onCompleted={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("alert", { name: /some targets failed/i })).toBeInTheDocument();
    expect(screen.getByText(/Fingerprint mismatch/i)).toBeInTheDocument();
  });
});
