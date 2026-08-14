import { act, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: /^create server$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/untitled profile/i)).toBeInTheDocument();
    expect(screen.getByText(/the island · 7777\/27015\/27020/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^browse$/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /base folder/i })).toHaveAttribute(
      "aria-readonly",
      "true",
    );
  });

  it("does not confirm leave after a successful save resets the dirty baseline (#299)", async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    const onSaved = vi.fn();
    let leaveGuard: ((action: () => void) => void) | null = null;
    window.api = {
      ...(window.api ?? {}),
      updateServer: vi.fn(async () => ({
        ok: true as const,
        data: profile({ id: "srv-a", name: "The Island X" }),
      })),
    } as typeof window.api;

    render(
      <AppProviders>
        <ServerForm
          initial={profile({ id: "srv-a", name: "The Island" })}
          onRegisterLeaveGuard={(guard) => {
            leaveGuard = guard;
          }}
          onCancel={vi.fn()}
          onSaved={onSaved}
        />
      </AppProviders>,
    );

    await user.type(screen.getByRole("textbox", { name: /^name$/i }), " X");
    await user.click(screen.getByRole("button", { name: /^save changes$/i }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });

    act(() => leaveGuard?.(onLeave));
    expect(onLeave).toHaveBeenCalledOnce();
    expect(screen.queryByText(/unsaved server changes/i)).not.toBeInTheDocument();
  });

  it("confirms before shell navigation discards a dirty create form (#292)", async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    let leaveGuard: ((action: () => void) => void) | null = null;

    render(
      <AppProviders>
        <ServerForm
          initial={null}
          onRegisterLeaveGuard={(guard) => {
            leaveGuard = guard;
          }}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    await user.type(screen.getByRole("textbox", { name: /^name$/i }), "The Island");
    expect(leaveGuard).not.toBeNull();

    act(() => leaveGuard?.(onLeave));

    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByText(/unsaved server changes/i)).toBeInTheDocument();
    expect(screen.getByText(/unsaved server profile changes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save and continue/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /discard and continue/i }));
    expect(onLeave).toHaveBeenCalledOnce();
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
    expect(screen.queryByLabelText(/^cluster id$/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /^cluster$/i }));
    await user.click(await screen.findByRole("option", { name: /alpha · via the island/i }));

    expect(screen.getByLabelText(/^cluster id$/i)).toHaveValue("alpha");
    expect(screen.getByText("C:\\ark_servers\\cluster\\alpha")).toBeInTheDocument();
  });

  it("preselects a single extra cluster from setup", () => {
    render(
      <AppProviders>
        <ServerForm
          initial={null}
          extraClusterOptions={[
            {
              clusterId: "ember",
              clusterDir: "D:\\ASA\\Clusters\\Ember",
              label: "ember · from setup",
            },
          ]}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("combobox", { name: /^cluster$/i })).toHaveValue(
      "ember · from setup",
    );
    expect(screen.getByLabelText(/^cluster id$/i)).toHaveValue("ember");
    expect(screen.getByText("D:\\ASA\\Clusters\\Ember")).toBeInTheDocument();
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
    expect(screen.queryByLabelText(/^cluster id$/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create a cluster first/i }));
    expect(onOpenClusters).toHaveBeenCalledOnce();
  });

  it("keeps free-text cluster id and PathField cluster dir on edit (#178 / #222)", () => {
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
    expect(screen.getByText("C:\\ark_servers\\cluster\\alpha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^browse$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /shared cluster directory/i }),
    ).toHaveAttribute("aria-readonly", "true");
    expect(screen.getByRole("button", { name: /^save changes$/i })).toBeInTheDocument();
    expect(screen.getByText(/the island · 7777\/27015\/27020/i)).toBeInTheDocument();
    expect(screen.getByText(/^reachability$/i)).toBeInTheDocument();
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

  it("shows Cancel on the embedded tab only when dirty and reverts (#299)", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <ServerForm
          initial={profile({ id: "srv-a", name: "The Island" })}
          variant="embedded"
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
    const name = screen.getByRole("textbox", { name: /^name$/i });
    await user.type(name, " X");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(name).toHaveValue("The Island");
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("uses the same grid in the embedded workspace tab (#292)", () => {
    render(
      <AppProviders>
        <ServerForm
          initial={profile({ id: "srv-a", name: "The Island" })}
          variant="embedded"
          onOpenConfigurationAssistant={vi.fn()}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/^server information$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /configuration wizard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save changes$/i })).toBeInTheDocument();
    expect(screen.getByText(/^reachability$/i)).toBeInTheDocument();
    expect(screen.getByText(/the island · 7777\/27015\/27020/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/auto-start with yark/i)).toBeInTheDocument();
  });

  it("hides Custom map on create (#292)", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <ServerForm initial={null} onCancel={vi.fn()} onSaved={vi.fn()} />
      </AppProviders>,
    );

    await user.click(screen.getByRole("combobox", { name: /^map$/i }));
    expect(screen.queryByRole("option", { name: /^custom/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/custom map token/i)).not.toBeInTheDocument();
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
            mapSaveFolder: "Svartalfheim",
          })}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("combobox", { name: /^map$/i })).toHaveValue("Custom…");
    expect(screen.getByLabelText(/custom map token/i)).toHaveValue("Svartalfheim_WP");
    expect(screen.getByLabelText(/world save folder/i)).toHaveValue("Svartalfheim");

    await user.clear(screen.getByLabelText(/custom map token/i));
    await user.type(screen.getByLabelText(/custom map token/i), "Amissa_WP");
    expect(screen.getByLabelText(/custom map token/i)).toHaveValue("Amissa_WP");
    expect(screen.getByLabelText(/world save folder/i)).toHaveValue("");
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
    await user.click(screen.getByRole("button", { name: /^save changes$/i }));
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
