import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerIniPayload, ServerIniSnapshot, ServerProfile, ServerRuntimeInfo } from "@shared/types";
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
  return {
    serverId,
    gameUserSettingsPath: `C:/ARK/${serverId}/GameUserSettings.ini`,
    gameIniPath: `C:/ARK/${serverId}/Game.ini`,
    gameUserSettingsExisted: true,
    gameIniExisted: true,
    payload: { gameUserSettings, game: "[ShooterGameMode]\nXPMultiplier=1\n" },
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
    saveServerIni: vi.fn(async () => ({
      ok: true,
      data: { valid: true, issues: [], diff: [], changedCount: 1, pending: false },
    })),
  } as typeof window.api;
}

const island = member("srv-a", "The Island", "TheIsland_WP");
const scorched = member("srv-b", "Scorched", "ScorchedEarth_WP");

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
          clusterId="alpha"
          members={[island, scorched]}
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

    expect(await screen.findByText(/different/i)).toBeInTheDocument();
    expect(screen.getAllByText(/missing/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 day").length).toBeGreaterThan(0);
    expect(screen.getByText("2 days")).toBeInTheDocument();
    expect(screen.getByText(/This map only/i)).toBeInTheDocument();
  });

  it("previews eligible and skipped members before saving the template and restoring stopped members", async () => {
    const user = userEvent.setup();
    const getClusterIniTemplate = vi.fn(async () => ({
      ok: true,
      data: {
        clusterId: "alpha",
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
    await user.click(await screen.findByRole("button", { name: /edit cluster settings/i }));
    const editor = await screen.findByRole("dialog", { name: /edit cluster-wide tribute settings/i });

    // Change item expiration to 36 hours
    const itemExpiration = await screen.findByRole("textbox", { name: /items expire after \(hours\)/i });
    await user.clear(itemExpiration);
    await user.type(itemExpiration, "36");

    // Check review shows correct values
    expect(editor.textContent).toContain("The Island");
    expect(editor.textContent).toContain("Scorched");
    expect(editor.textContent).toContain("must not be running");
    expect(editor.textContent).toContain("Items expire after: 36 hours");
    expect(window.api.saveClusterIniTemplate).not.toHaveBeenCalled();

    // Propagate (saving auto-propagates to stopped members)
    await user.click(within(editor).getByRole("button", { name: /propagate to 1 stopped member/i }));
    await waitFor(() =>
      expect(window.api.restoreClusterIniFromTemplate).toHaveBeenCalledWith("alpha", "srv-a", {
        gameUserSettings: true,
        game: false,
      }),
    );
    expect(window.api.restoreClusterIniFromTemplate).toHaveBeenCalledTimes(1);
    expect(window.api.saveClusterIniTemplate).toHaveBeenCalledWith(
      "alpha",
      expect.objectContaining({
        gameUserSettings: expect.stringContaining("UnrelatedTemplateValue=keep-too"),
      }),
    );
    expect(window.api.saveClusterIniTemplate).toHaveBeenCalledWith(
      "alpha",
      expect.objectContaining({ gameUserSettings: expect.stringContaining("TributeItemExpirationSeconds=129600") }),
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("disables per-map writes for a running selected member", async () => {
    installApi((id) => snapshot(id, gus));

    render(
      <AppProviders>
        <ClusterTributePanel
          clusterId="alpha"
          members={[island, scorched]}
          statuses={
            new Map([
              ["srv-a", runtime("running")],
              ["srv-b", { ...runtime("stopped"), serverId: "srv-b" }],
            ])
          }
          onChanged={vi.fn()}
        />
      </AppProviders>,
    );

    // Wait for loading to complete
    await screen.findByText(/Cluster-wide settings/i);

    // The per-map edit button should be disabled for running server
    expect(screen.getByRole("button", { name: /edit settings for this map/i })).toBeDisabled();
    expect(window.api.saveServerIni).not.toHaveBeenCalled();
  });

  it("saves per-map controls only to the selected stopped member", async () => {
    const user = userEvent.setup();
    installApi((id) => snapshot(id, gus));

    render(
      <AppProviders>
        <ClusterTributePanel
          clusterId="alpha"
          members={[island, scorched]}
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

    // Open per-map editor
    await user.click(await screen.findByRole("button", { name: /edit settings for this map/i }));
    const editor = await screen.findByRole("dialog", { name: /edit per-map tribute settings/i });

    // Toggle a checkbox
    await user.click(await screen.findByRole("checkbox", { name: "Prevent item uploads" }));

    // Preview & save
    await user.click(within(editor).getByRole("button", { name: /preview & save/i }));
    const previewDialog = await screen.findByRole("dialog", { name: /edit per-map tribute settings/i });
    expect(previewDialog.textContent).toContain("Only The Island will be changed");
    await user.click(within(previewDialog).getByRole("button", { name: /save this map/i }));

    await waitFor(() => expect(window.api.saveServerIni).toHaveBeenCalledOnce());
    const [serverId, payload] = vi.mocked(window.api.saveServerIni).mock.calls[0]!;
    expect(serverId).toBe("srv-a");
    expect(payload.gameUserSettings).toContain("PreventUploadItems=True");
    expect(payload.gameUserSettings).toContain("UnrelatedSetting=keep-me");
  });
});
