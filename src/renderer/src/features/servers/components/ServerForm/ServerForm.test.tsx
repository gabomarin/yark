import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile } from "@shared/types";
import { ServerForm } from "./ServerForm";

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

describe("ServerForm", () => {
  it("renders the main fields", () => {
    render(
      <AppProviders>
        <ServerForm initial={null} onCancel={vi.fn()} onSaved={vi.fn()} />
      </AppProviders>,
    );

    expect(screen.getAllByLabelText(/name/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^map$/i)).toBeInTheDocument();
    expect(screen.getByText(/new server/i)).toBeInTheDocument();
    expect(screen.getByText(/^base folder$/i)).toBeInTheDocument();
  });

  it("joins an existing cluster from the create picker (#178)", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <ServerForm
          initial={null}
          servers={[
            profile({
              id: "srv-a",
              name: "The Island",
              clusterId: "alpha",
              clusterDir: "C:\\ark_servers\\cluster\\alpha",
            }),
          ]}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("combobox", { name: /^cluster$/i })).toHaveValue("None");
    expect(screen.getByLabelText(/^cluster id$/i)).toHaveValue("");
    expect(screen.getByText("—")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /^cluster$/i }));
    await user.click(await screen.findByRole("option", { name: /alpha · via the island/i }));

    expect(screen.getByLabelText(/^cluster id$/i)).toHaveValue("alpha");
    expect(screen.getByText("C:\\ark_servers\\cluster\\alpha")).toBeInTheDocument();
  });

  it("shows create-a-cluster-first when no clusters exist (#178)", async () => {
    const user = userEvent.setup();
    const onOpenClusters = vi.fn();

    render(
      <AppProviders>
        <ServerForm
          initial={null}
          servers={[profile({ id: "solo", name: "Solo" })]}
          onOpenClusters={onOpenClusters}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("combobox", { name: /^cluster$/i })).toHaveValue("None");
    expect(screen.getByLabelText(/^cluster id$/i)).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /create a cluster first/i }));
    expect(onOpenClusters).toHaveBeenCalledOnce();
  });

  it("keeps free-text cluster fields on edit (#178)", () => {
    render(
      <AppProviders>
        <ServerForm
          initial={profile({
            id: "srv-a",
            name: "The Island",
            clusterId: "alpha",
            clusterDir: "C:\\ark_servers\\cluster\\alpha",
          })}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("combobox", { name: /^cluster$/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/cluster id/i)).toHaveValue("alpha");
  });

  it("previews port conflicts against the fleet (#178)", () => {
    render(
      <AppProviders>
        <ServerForm
          initial={null}
          servers={[
            profile({
              id: "srv-a",
              name: "The Island",
              gamePort: 7777,
              queryPort: 27015,
              rconPort: 27020,
            }),
          ]}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/port conflicts/i)).toBeInTheDocument();
    expect(screen.getByText(/port 7777 \(game\)/i)).toBeInTheDocument();
  });

  it("opens the ASA launch-options catalog from Extra arguments (#92)", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <ServerForm initial={null} onCancel={vi.fn()} onSaved={vi.fn()} />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /browse asa catalog/i }));
    expect(
      await screen.findByRole("dialog", { name: /asa launch-options catalog/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ark\.wiki\.gg Command line options/i)).toBeInTheDocument();
  });
});
