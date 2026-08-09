import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notifications } from "@mantine/notifications";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { RendererApi } from "@shared/ipc";
import type { ModMetadata, ServerProfile } from "@shared/types";
import { ServerModsPanel } from "./ServerModsPanel";

const awesomeDetail: ModMetadata = {
  id: "947033",
  name: "Awesome Spyglass!",
  summary: "Awesomer.",
  thumbnailUrl: null,
  authors: ["ChrisMods"],
  downloadCount: 9_449_769,
  dateModified: "2025-09-01T00:00:00.000Z",
  curseforgeUrl:
    "https://www.curseforge.com/ark-survival-ascended/mods/awesomespyglass",
  slug: "awesomespyglass",
  categories: ["Visuals and Sounds"],
};

const superDetail: ModMetadata = {
  ...awesomeDetail,
  id: "929420",
  name: "Super Spyglass Plus",
  summary: "Advanced information.",
  thumbnailUrl: "https://83374.media.forgecdn.net/avatars/super-spyglass.png",
  authors: ["kavan87"],
  downloadCount: 13_500_000,
  dateModified: "2026-05-28T00:00:00.000Z",
  curseforgeUrl:
    "https://www.curseforge.com/ark-survival-ascended/mods/super-spyglass-plus",
  slug: "super-spyglass-plus",
  categories: ["General"],
};

const mapModDetail: ModMetadata = {
  ...awesomeDetail,
  id: "962796",
  name: "Svartalfheim Premium",
  summary: "Map Name: Svartalfheim_WP",
  thumbnailUrl: null,
  authors: ["Author"],
  downloadCount: 1000,
  dateModified: "2026-06-01T00:00:00.000Z",
  curseforgeUrl:
    "https://www.curseforge.com/ark-survival-ascended/mods/svartalfheim-premium",
  slug: "svartalfheim-premium",
  categories: ["Maps"],
};

const server: ServerProfile = {
  id: "server-1",
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
  mods: ["947033"],
  disabledMods: [],
  modMetadataCache: { "947033": awesomeDetail },
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

function installApi(): RendererApi {
  const api = {
    getModsMetadata: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    searchMods: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        items: [superDetail],
        pagination: {
          index: 0,
          pageSize: 50,
          resultCount: 1,
          totalCount: 1,
        },
      },
    }),
    getModByReference: vi.fn().mockResolvedValue({
      ok: true,
      data: superDetail,
    }),
    openCurseForgeMod: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    updateServer: vi.fn().mockResolvedValue({ ok: true, data: server }),
  } as unknown as RendererApi;
  Object.defineProperty(window, "api", { configurable: true, value: api });
  return api;
}

function renderPanel(): void {
  render(
    <AppProviders>
      <ServerModsPanel server={server} onServerUpdated={vi.fn()} />
    </AppProviders>,
  );
}

const addLabel = "Add CurseForge Project ID or mod URL";

/** Avoid per-keystroke typing of long CurseForge URLs (flaky under CI 5s timeout). */
function fillAddField(value: string): void {
  fireEvent.change(screen.getByLabelText(addLabel), { target: { value } });
}

describe("ServerModsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("toasts when enabling a Maps mod without changing map (#192)", async () => {
    const api = installApi();
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    vi.mocked(api.getModByReference).mockResolvedValue({
      ok: true,
      data: {
        ...mapModDetail,
        description: "Map Name: Svartalfheim_WP\nMod ID: 962796",
      },
    });
    const user = userEvent.setup();
    const mapServer: ServerProfile = {
      ...server,
      mods: ["962796"],
      disabledMods: ["962796"],
      modMetadataCache: { "962796": mapModDetail },
    };
    render(
      <AppProviders>
        <ServerModsPanel server={mapServer} onServerUpdated={vi.fn()} />
      </AppProviders>,
    );

    await user.click(
      screen.getByRole("switch", { name: "Enable Svartalfheim Premium" }),
    );
    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          map: "TheIsland_WP",
          mods: ["962796"],
          disabledMods: [],
        }),
      );
    });
    expect(screen.queryByRole("dialog", { name: /use as server map/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Map mod available",
          message: expect.stringContaining("Map mods"),
        }),
      );
    });
  });

  it("toasts Custom… guidance when a Maps mod has no detectable token", async () => {
    const api = installApi();
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    const mapModWithoutToken: ModMetadata = {
      ...mapModDetail,
      summary: "A custom map pack.",
    };
    vi.mocked(api.getModByReference).mockResolvedValue({
      ok: true,
      data: mapModWithoutToken,
    });
    const user = userEvent.setup();
    render(
      <AppProviders>
        <ServerModsPanel
          server={{
            ...server,
            mods: ["962796"],
            disabledMods: ["962796"],
            modMetadataCache: { "962796": mapModWithoutToken },
          }}
          onServerUpdated={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(
      screen.getByRole("switch", { name: "Enable Svartalfheim Premium" }),
    );
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Map mod available",
          message: expect.stringContaining("Custom…"),
        }),
      );
    });
  });

  it("does not revert a concurrent toggle while refreshing map-mod metadata", async () => {
    const api = installApi();
    vi.spyOn(notifications, "show").mockImplementation(() => "id");
    let releaseDetail!: () => void;
    const detailGate = new Promise<void>((resolve) => {
      releaseDetail = resolve;
    });
    const mapModWithoutToken: ModMetadata = {
      ...mapModDetail,
      summary: "A custom map pack.",
    };
    vi.mocked(api.getModByReference).mockImplementation(async () => {
      await detailGate;
      return {
        ok: true,
        data: {
          ...mapModWithoutToken,
          description: "Map Name: Svartalfheim_WP\nMod ID: 962796",
        },
      };
    });
    const user = userEvent.setup();
    const mapServer: ServerProfile = {
      ...server,
      mods: ["962796", "947033"],
      disabledMods: ["962796"],
      modMetadataCache: {
        "962796": mapModWithoutToken,
        "947033": awesomeDetail,
      },
    };
    render(
      <AppProviders>
        <ServerModsPanel server={mapServer} onServerUpdated={vi.fn()} />
      </AppProviders>,
    );

    await user.click(
      screen.getByRole("switch", { name: "Enable Svartalfheim Premium" }),
    );
    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          mods: ["962796", "947033"],
          disabledMods: [],
        }),
      );
    });

    await user.click(
      screen.getByRole("switch", { name: "Disable Awesome Spyglass!" }),
    );
    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          mods: ["962796", "947033"],
          disabledMods: ["947033"],
        }),
      );
    });

    const callsBeforeRelease = vi.mocked(api.updateServer).mock.calls.length;
    releaseDetail();
    await waitFor(() => {
      expect(vi.mocked(api.updateServer).mock.calls.length).toBeGreaterThan(
        callsBeforeRelease,
      );
    });
    const lastCall = vi.mocked(api.updateServer).mock.calls.at(-1)?.[1];
    expect(lastCall).toEqual(
      expect.objectContaining({
        mods: ["962796", "947033"],
        disabledMods: ["947033"],
        modMetadataCache: expect.objectContaining({
          "962796": expect.objectContaining({
            description: "Map Name: Svartalfheim_WP\nMod ID: 962796",
          }),
        }),
      }),
    );
  });

  it("uses cached metadata and disables a mod without removing it", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText("Awesome Spyglass!")).toBeInTheDocument();
    expect(api.getModsMetadata).not.toHaveBeenCalled();
    expect(screen.getByText("Visuals and Sounds")).toBeInTheDocument();
    await user.click(screen.getByText("Awesome Spyglass!"));
    expect(await screen.findByText("Mod details")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Disable Awesome Spyglass!" }));
    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          mods: ["947033"],
          disabledMods: ["947033"],
          modMetadataCache: { "947033": awesomeDetail },
        }),
      );
    });
  });

  it("resolves a CurseForge URL and persists the new mod metadata", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPanel();
    const url = superDetail.curseforgeUrl;

    fillAddField(url);
    await user.click(screen.getByRole("button", { name: "Add mod" }));

    expect(api.getModByReference).toHaveBeenCalledWith(url);
    expect(screen.queryByText("Mod details")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          mods: ["947033", "929420"],
          disabledMods: ["929420"],
          modMetadataCache: {
            "947033": awesomeDetail,
            "929420": superDetail,
          },
        }),
      );
    });
  });

  it("shows import progress while resolving multiple refs", async () => {
    const api = installApi();
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    vi.mocked(api.getModByReference).mockImplementation(async (ref) => {
      calls += 1;
      if (calls === 1) await first;
      return {
        ok: true,
        data: {
          ...superDetail,
          id: String(900000 + calls),
          curseforgeUrl: String(ref),
          slug: `mod-${calls}`,
        },
      };
    });
    const user = userEvent.setup();
    renderPanel();
    const urls = [
      "https://www.curseforge.com/ark-survival-ascended/mods/one",
      "https://www.curseforge.com/ark-survival-ascended/mods/two",
    ].join(",");

    fillAddField(urls);
    await user.click(screen.getByRole("button", { name: "Add mod" }));

    expect(await screen.findByText(/Importing mods 0\/2/)).toBeInTheDocument();
    releaseFirst();
    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByText(/Importing mods/)).not.toBeInTheDocument();
    });
  });

  it("accepts Project IDs via the Worker", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(addLabel), "929420");
    await user.click(screen.getByRole("button", { name: "Add mod" }));

    expect(api.getModByReference).toHaveBeenCalledWith("929420");
    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          mods: ["947033", "929420"],
          disabledMods: ["929420"],
        }),
      );
    });
  });

  it("rejects input with only invalid tokens before updating", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(addLabel), "not-a-url");
    await user.click(screen.getByRole("button", { name: "Add mod" }));

    expect(await screen.findByText(/No valid mods to add/)).toBeInTheDocument();
    expect(api.getModByReference).not.toHaveBeenCalled();
    expect(api.updateServer).not.toHaveBeenCalled();
  });

  it("removes a configured mod and its cached metadata after confirmation", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", {
      name: "Remove Awesome Spyglass!",
    }));
    await user.click(await screen.findByRole("button", { name: "Remove mod" }));

    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          mods: [],
          disabledMods: [],
          modMetadataCache: {},
        }),
      );
    });
  });

  it("confirms before removing from the row context menu", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPanel();

    const row = document.querySelector("[data-mod-row]");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!);

    await user.click(
      await screen.findByRole("menuitem", { name: /Remove Awesome Spyglass/i }),
    );
    expect(api.updateServer).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Remove mod" }));
    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          mods: [],
          modMetadataCache: {},
        }),
      );
    });
  });

  it("opens CurseForge links through the operating system", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      await screen.findByRole("button", {
        name: "Open CurseForge Awesome Spyglass!",
      }),
    );
    expect(api.openCurseForgeMod).toHaveBeenCalledWith(awesomeDetail.curseforgeUrl);
  });

  it("keeps discovery results separate and adds a result", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("radio", { name: "Discover mods" }));
    await user.click(screen.getByRole("button", { name: "Search mods" }));
    expect(await screen.findByText("Super Spyglass Plus")).toBeInTheDocument();
    expect(screen.queryByText("Awesome Spyglass!")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Super Spyglass Plus" }));

    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          mods: ["947033", "929420"],
          disabledMods: ["929420"],
        }),
      );
    });
  });

  it("shows row loading while uncached metadata is fetched", async () => {
    const api = installApi();
    vi.mocked(api.getModByReference).mockImplementation(
      () => new Promise(() => undefined),
    );
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("radio", { name: "Discover mods" }));
    await user.click(screen.getByRole("button", { name: "Search mods" }));
    await user.click(await screen.findByText("Super Spyglass Plus"));

    expect(await screen.findByText("Loading metadata…")).toBeInTheDocument();
  });
});
