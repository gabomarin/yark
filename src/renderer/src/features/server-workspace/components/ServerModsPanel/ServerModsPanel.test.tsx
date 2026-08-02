import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const server: ServerProfile = {
  id: "server-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:\\ARK\\TheIsland",
  enabled: true,
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

describe("ServerModsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

    await user.type(screen.getByLabelText(addLabel), url);
    await user.click(screen.getByRole("button", { name: "Add mod" }));

    expect(api.getModByReference).toHaveBeenCalledWith(url);
    expect(screen.queryByText("Mod details")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({
          mods: ["947033", "929420"],
          disabledMods: [],
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

    await user.type(screen.getByLabelText(addLabel), urls);
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
        expect.objectContaining({ mods: ["947033", "929420"] }),
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

  it("opens CurseForge links through the operating system", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "CurseForge" }));
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
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(api.updateServer).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({ mods: ["947033", "929420"] }),
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
