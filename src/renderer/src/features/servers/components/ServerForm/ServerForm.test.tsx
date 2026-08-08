import { render, screen, waitFor } from "@testing-library/react";
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

  it("does not show Mods or Extra arguments on create/edit (#93)", () => {
    render(
      <AppProviders>
        <ServerForm initial={null} onCancel={vi.fn()} onSaved={vi.fn()} />
      </AppProviders>,
    );

    expect(screen.queryByLabelText(/^mods$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/extra arguments/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /browse asa catalog/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-form-launch-summary")).not.toBeInTheDocument();
  });

  it("allows Custom map launch token (#65 / #191)", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <ServerForm
          initial={profile({
            id: "srv-svart",
            name: "Svart",
            map: "Svartalfheim_WP",
          })}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("combobox", { name: /^map$/i })).toHaveValue("Custom…");
    expect(screen.getByLabelText(/custom map name/i)).toHaveValue("Svartalfheim_WP");

    await user.clear(screen.getByLabelText(/custom map name/i));
    await user.type(screen.getByLabelText(/custom map name/i), "Amissa_WP");
    expect(screen.getByLabelText(/custom map name/i)).toHaveValue("Amissa_WP");
  });

  it("lists enabled Map mods in a grouped Map select (#192)", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    window.api = {
      ...(window.api ?? {}),
      updateServer: vi.fn(async (_id, input) => ({
        ok: true as const,
        data: profile({ ...input, id: "srv-svart" }),
      })),
    } as typeof window.api;

    render(
      <AppProviders>
        <ServerForm
          initial={profile({
            id: "srv-svart",
            name: "Svart",
            map: "TheIsland_WP",
            mods: ["962796"],
            disabledMods: [],
            modMetadataCache: {
              "962796": {
                id: "962796",
                name: "Svartalfheim Premium",
                summary: "Map pack",
                description: "Map Name: Svartalfheim_WP",
                thumbnailUrl: null,
                authors: ["Author"],
                downloadCount: 1,
                dateModified: "2026-01-01T00:00:00.000Z",
                curseforgeUrl:
                  "https://www.curseforge.com/ark-survival-ascended/mods/svartalfheim-premium",
                slug: "svartalfheim-premium",
                categories: ["Maps"],
              },
            },
          })}
          onCancel={vi.fn()}
          onSaved={onSaved}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("combobox", { name: /^map$/i }));
    expect(await screen.findByText("Map mods")).toBeInTheDocument();
    await user.click(
      screen.getByRole("option", { name: /^Svartalfheim Premium$/i }),
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(window.api.updateServer).toHaveBeenCalledWith(
        "srv-svart",
        expect.objectContaining({
          map: "Svartalfheim_WP",
          mapModId: "962796",
        }),
      );
    });
  });
});
