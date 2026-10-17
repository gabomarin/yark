import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type {
  IniFileFingerprints,
  ServerIniPayload,
  ServerIniSnapshot,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";

/** Stable mock fingerprints (renderer tests must not import node:crypto). */
function fingerprintIniPayload(payload: ServerIniPayload): IniFileFingerprints {
  return {
    gameUserSettings: `gus:${payload.gameUserSettings.length}`.padEnd(24, "0").slice(0, 24),
    game: `game:${payload.game.length}`.padEnd(24, "0").slice(0, 24),
  };
}
import { ClusterTributePanel } from "./ClusterTributePanel";

function member(id: string, name: string, map: string): ServerProfile {
  return {
    id,
    name,
    map,
    installDir: `C:/ARK/${id}`,
    sessionName: name,
    maxPlayers: 70,
    gamePort: id === "srv-a" ? 7777 : 7779,
    queryPort: id === "srv-a" ? 27015 : 27017,
    rconPort: id === "srv-a" ? 27020 : 27022,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: "alpha",
    clusterDir: "C:/ARK/cluster",
    extraArgs: [],
    mods: [],
    enabled: true,
    autoStart: false,
    useAsaApi: false,
    useAsaApiLoader: false,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
}

function snapshot(serverId: string, gameUserSettings: string): ServerIniSnapshot {
  const payload = { gameUserSettings, game: "[ShooterGameMode]\nXPMultiplier=1\n" };
  return {
    serverId,
    gameUserSettingsPath: `C:/ARK/${serverId}/GameUserSettings.ini`,
    gameIniPath: `C:/ARK/${serverId}/Game.ini`,
    gameUserSettingsExisted: true,
    gameIniExisted: true,
    payload,
    fingerprints: fingerprintIniPayload(payload),
    pending: false,
    pendingUpdatedAt: null,
  };
}

const gus = `[ServerSettings]
TributeItemExpirationSeconds=86400
TributeDinoExpirationSeconds=86400
TributeCharacterExpirationSeconds=0
MaxTributeItems=50
MaxTributeDinos=20
MaxTributeCharacters=10
PreventUploadItems=False
PreventDownloadItems=False
PreventUploadDinos=False
PreventDownloadDinos=False
PreventUploadSurvivors=False
PreventDownloadSurvivors=False
noTributeDownloads=False
CrossARKAllowForeignDinoDownloads=False
UnrelatedSetting=keep-me
`;

function runtime(status: ServerRuntimeInfo["status"]): ServerRuntimeInfo {
  return {
    serverId: "srv-a",
    status,
    processLive: status !== "stopped" && status !== "error",
    pid: null,
    startedAt: null,
    lastError: null,
  };
}

function installApi(read: (serverId: string) => ServerIniSnapshot): void {
  window.api = {
    ...(window.api ?? {}),
    readServerIni: vi.fn(async (serverId: string) => ({ ok: true, data: read(serverId) })),
    getClusterIniTemplate: vi.fn(async () => ({ ok: true, data: null })),
    previewClusterIniTemplate: vi.fn(async () => ({
      ok: true,
      data: { valid: true, issues: [], diff: [], changedCount: 6 },
    })),
    saveClusterIniTemplate: vi.fn(async (clusterId: string, payload: ServerIniPayload) => ({
      ok: true,
      data: {
        template: { clusterId, payload, updatedAt: "2026-08-05T00:00:00.000Z" },
        preview: { valid: true, issues: [], diff: [], changedCount: 6 },
      },
    })),
    restoreClusterIniFromTemplate: vi.fn(async () => ({
      ok: true,
      data: {
        operation: "restore" as const,
        clusterId: "alpha",
        serverId: "srv-a",
        preview: { valid: true, issues: [], diff: [], changedCount: 1 },
        files: { gameUserSettings: true, game: false },
        template: {
          clusterId: "alpha",
          payload: { gameUserSettings: "", game: "" },
          updatedAt: "2026-08-05T00:00:00.000Z",
        },
        backupId: null,
        snapshotDir: null,
      },
    })),
    previewServerIni: vi.fn(async () => ({ ok: true, data: { valid: true, issues: [], diff: [], changedCount: 1 } })),
    saveServerIni: vi.fn(async (_serverId: string, payload: ServerIniPayload) => ({
      ok: true,
      data: {
        valid: true,
        issues: [],
        diff: [],
        changedCount: 1,
        pending: false,
        fingerprints: fingerprintIniPayload(payload),
      },
    })),
  } as typeof window.api;
}

const island = member("srv-a", "The Island", "TheIsland_WP");
const scorched = member("srv-b", "Scorched", "ScorchedEarth_WP");

function panelActions() {
  return {
    snapshots: new Map([
      ["srv-a", snapshot("srv-a", gus)],
      ["srv-b", snapshot("srv-b", gus)],
    ]),
    templateValues: {},
    loading: false,
    error: null,
    onRefresh: vi.fn(async () => {}),
    hasTemplate: false,
    canRemoveAny: true,
    onChanged: vi.fn(),
    onTemplateChanged: vi.fn(),
    onOpenServer: vi.fn(),
    onRemoveAll: vi.fn(),
    onRemoveServer: vi.fn(),
    onPromoteToTemplate: vi.fn(),
    onApplyIniTemplate: vi.fn(),
  };
}

describe("ClusterTributePanel", () => {
  afterEach(cleanup);

  it("shows current cluster-wide values and surfaces missing or differing values", async () => {
    const differentAndMissing = gus
      .replace("TributeItemExpirationSeconds=86400", "TributeItemExpirationSeconds=172800")
      .replace("TributeCharacterExpirationSeconds=0\n", "");
    installApi((id) => snapshot(id, id === "srv-a" ? gus : differentAndMissing));

    render(
      <AppProviders>
        <ClusterTributePanel
          {...panelActions()}
          clusterId="alpha"
          members={[island, scorched]}
          snapshots={
            new Map([
              ["srv-a", snapshot("srv-a", gus)],
              ["srv-b", snapshot("srv-b", differentAndMissing)],
            ])
          }
          statuses={
            new Map([
              ["srv-a", runtime("stopped")],
              ["srv-b", { ...runtime("stopped"), serverId: "srv-b" }],
            ])
          }
          onChanged={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getAllByText(/missing/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("row", { name: /The Island/ })).toBeInTheDocument();
    expect(screen.getAllByText(/86,400 seconds \(1 day\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/172,800 seconds \(2 days\)/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /edit settings for this map/i })).not.toBeInTheDocument();
  });

  it("applies cluster-wide values only to stopped members and preserves other member INI keys", async () => {
    const user = userEvent.setup();
    const getClusterIniTemplate = vi.fn(async () => ({
      ok: true,
      data: {
        clusterId: "alpha",
        // Sparse/empty-ish template must not wipe member GUS on Save and apply.
        payload: { gameUserSettings: "[ServerSettings]\nUnrelatedTemplateValue=keep-too\n", game: "" },
        updatedAt: "2026-08-05T00:00:00.000Z",
      },
    }));
    installApi((id) => snapshot(id, gus));
    window.api = { ...window.api, getClusterIniTemplate } as typeof window.api;
    const onChanged = vi.fn();

    render(
      <AppProviders>
        <ClusterTributePanel
          {...panelActions()}
          clusterId="alpha"
          members={[island, scorched]}
          statuses={
            new Map([
              ["srv-a", runtime("stopped")],
              ["srv-b", { ...runtime("running"), serverId: "srv-b" }],
            ])
          }
          onChanged={onChanged}
        />
      </AppProviders>,
    );

    // Open cluster-wide editor
    await user.click(await screen.findByRole("button", { name: /edit transfer settings/i }));
    const editor = await screen.findByRole("dialog", { name: /edit cluster transfer settings/i });

    // Change item expiration to 36 hours
    const itemExpiration = await screen.findByRole("textbox", { name: /items expire after \(seconds\)/i });
    await user.clear(itemExpiration);
    await user.type(itemExpiration, "36");

    // The modal only expands skipped members on request.
    await user.click(within(editor).getByRole("button", { name: /show 1 skipped member/i }));
    expect(editor.textContent).toContain("Scorched");
    expect(editor.textContent).toContain("must not be running");
    expect(itemExpiration).toHaveValue("36");
    expect(window.api.saveClusterIniTemplate).not.toHaveBeenCalled();

    // Save-and-apply lives behind the split-button menu (rendered in a portal).
    await user.click(within(editor).getByRole("button", { name: /more save options/i }));
    await user.click(await screen.findByRole("menuitem", { name: /save and apply to servers/i }));
    await waitFor(() => expect(window.api.saveServerIni).toHaveBeenCalledTimes(1));
    expect(window.api.restoreClusterIniFromTemplate).not.toHaveBeenCalled();
    expect(window.api.saveServerIni).toHaveBeenCalledWith(
      "srv-a",
      expect.objectContaining({
        gameUserSettings: expect.stringMatching(/TributeItemExpirationSeconds=36/),
      }),
      expect.objectContaining({ gameUserSettings: expect.any(String), game: expect.any(String) }),
    );
    const savedPayload = vi.mocked(window.api.saveServerIni).mock.calls[0]?.[1] as ServerIniPayload;
    expect(savedPayload.gameUserSettings).toContain("UnrelatedSetting=keep-me");
    expect(savedPayload.gameUserSettings).toContain("PreventUploadItems=False");
    expect(savedPayload.gameUserSettings).not.toContain("UnrelatedTemplateValue=keep-too");
    expect(window.api.saveClusterIniTemplate).toHaveBeenCalledWith(
      "alpha",
      expect.objectContaining({
        gameUserSettings: expect.stringContaining("UnrelatedTemplateValue=keep-too"),
      }),
    );
    expect(window.api.saveClusterIniTemplate).toHaveBeenCalledWith(
      "alpha",
      expect.objectContaining({ gameUserSettings: expect.stringContaining("TributeItemExpirationSeconds=36") }),
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("keeps per-map settings intact when Save and apply runs with an empty cluster template", async () => {
    const user = userEvent.setup();
    installApi((id) => snapshot(id, gus));
    // Default installApi returns no template; Save and apply must still patch keys only.
    render(
      <AppProviders>
        <ClusterTributePanel
          {...panelActions()}
          clusterId="alpha"
          members={[island]}
          statuses={new Map([["srv-a", runtime("stopped")]])}
        />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("button", { name: /edit transfer settings/i }));
    await user.click(await screen.findByRole("button", { name: /more save options/i }));
    await user.click(await screen.findByRole("menuitem", { name: /save and apply to servers/i }));

    await waitFor(() => expect(window.api.saveServerIni).toHaveBeenCalledTimes(1));
    expect(window.api.restoreClusterIniFromTemplate).not.toHaveBeenCalled();
    const savedPayload = vi.mocked(window.api.saveServerIni).mock.calls[0]?.[1] as ServerIniPayload;
    expect(savedPayload.gameUserSettings).toContain("UnrelatedSetting=keep-me");
    expect(savedPayload.gameUserSettings).toContain("PreventUploadItems=False");
    expect(savedPayload.gameUserSettings).toMatch(/TributeItemExpirationSeconds=\d+/);
  });

  it("keeps applying to later members when an earlier member's apply rejects", async () => {
    const user = userEvent.setup();
    installApi((id) => snapshot(id, gus));
    const saveServerIni = vi.fn(async (serverId: string, payload: ServerIniPayload) => {
      if (serverId === "srv-a") throw new Error("IPC exploded");
      return {
        ok: true as const,
        data: {
          valid: true,
          issues: [],
          diff: [],
          changedCount: 1,
          pending: false,
          fingerprints: fingerprintIniPayload(payload),
        },
      };
    });
    window.api = { ...window.api, saveServerIni } as typeof window.api;

    render(
      <AppProviders>
        <ClusterTributePanel
          {...panelActions()}
          clusterId="alpha"
          members={[island, scorched]}
          statuses={
            new Map([
              ["srv-a", runtime("stopped")],
              ["srv-b", { ...runtime("stopped"), serverId: "srv-b" }],
            ])
          }
        />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("button", { name: /edit transfer settings/i }));
    await user.click(await screen.findByRole("button", { name: /more save options/i }));
    await user.click(await screen.findByRole("menuitem", { name: /save and apply to servers/i }));

    await waitFor(() => expect(saveServerIni).toHaveBeenCalledTimes(2));
    expect(saveServerIni).toHaveBeenCalledWith("srv-b", expect.anything(), expect.anything());
  });

  it("keeps per-map settings in the server INI workspace", async () => {
    const restrictedGus = gus.replace("PreventUploadItems=False", "PreventUploadItems=True");
    installApi((id) => snapshot(id, id === "srv-a" ? restrictedGus : gus));

    render(
      <AppProviders>
        <ClusterTributePanel
          {...panelActions()}
          clusterId="alpha"
          members={[island, scorched]}
          snapshots={
            new Map([
              ["srv-a", snapshot("srv-a", restrictedGus)],
              ["srv-b", snapshot("srv-b", gus)],
            ])
          }
          statuses={
            new Map([
              ["srv-a", runtime("stopped")],
              ["srv-b", { ...runtime("stopped"), serverId: "srv-b" }],
            ])
          }
          onChanged={vi.fn()}
        />
      </AppProviders>,
    );

    expect(await screen.findByText(/Per-map transfer overrides are active on 1 server/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit settings for this map/i })).not.toBeInTheDocument();
    expect(window.api.saveServerIni).not.toHaveBeenCalled();
  });
});
