import { render, screen, waitFor } from "@testing-library/react";
import type { ServerProfile } from "@shared/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { setupUser } from "@renderer/test/setupUser";
import { ImportCompatibilityReport } from "./ImportCompatibilityReport";

const server: ServerProfile = {
  id: "srv-a",
  name: "Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/Island",
  enabled: true,
  autoStart: false,
  useAsaApi: false,
  useAsaApiLoader: false,
  sessionName: "Island",
  maxPlayers: 70,
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: "secret-join",
  adminPassword: "secret-admin",
  clusterId: null,
  clusterDir: null,
  extraArgs: [],
  mods: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const matchingGus = `[SessionSettings]
SessionName=Island
Port=7777
QueryPort=27015

[ServerSettings]
RCONEnabled=True
RCONPort=27020
ServerAdminPassword=secret-admin
ServerPassword=secret-join
XPMultiplier=2
`;

function renderReport(gameUserSettings: string, game = "", servers: ServerProfile[] = [server]): void {
  vi.stubGlobal("api", {
    readServerIni: vi.fn(async () => ({
      ok: true as const,
      data: { payload: { gameUserSettings, game } },
    })),
    updateServer: vi.fn(async () => ({ ok: true as const, data: server })),
  });
  render(
    <AppProviders>
      <ImportCompatibilityReport server={server} servers={servers} />
    </AppProviders>,
  );
}

describe("ImportCompatibilityReport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays hidden when the Server form already matches the file", async () => {
    renderReport(matchingGus);
    await waitFor(() => expect(window.api.readServerIni).toHaveBeenCalledWith("srv-a"));
    await waitFor(() => {
      expect(screen.queryByRole("alert", { name: "Choose which values to keep" })).not.toBeInTheDocument();
    });
  });

  it("lists a port change and omits password text (#682)", async () => {
    renderReport(
      matchingGus
        .replace("Port=7777", "Port=7778")
        .replace("ServerAdminPassword=secret-admin", "ServerAdminPassword=old-secret"),
      `[/Script/ShooterGame.ShooterGameMode]
ConfigOverrideItemMaxQuantity=(hello world)
`,
    );
    const alert = await screen.findByRole("alert", { name: "Choose which values to keep" });
    expect(alert).toHaveTextContent(
      "GameUserSettings.ini has values that differ from this server's settings in YARK. Choose which values to keep:",
    );
    expect(alert).toHaveTextContent("Game port in GameUserSettings.ini: 7778.");
    expect(alert).toHaveTextContent("Game port in YARK: 7777.");
    expect(alert).toHaveTextContent("Admin password differs between GameUserSettings.ini and YARK. Values are hidden.");
    expect(alert).toHaveTextContent("One line in the file stays word for word. YARK doesn't read it.");
    expect(alert).not.toHaveTextContent("secret-admin");
    expect(alert).not.toHaveTextContent("secret-join");
    expect(alert).not.toHaveTextContent("old-secret");
  });

  it("refuses to copy an INI port that another server already uses", async () => {
    const user = setupUser();
    renderReport(matchingGus.replace("Port=7777", "Port=7778"), "", [
      server,
      { ...server, id: "srv-b", name: "Other", gamePort: 7778, queryPort: 27016, rconPort: 27021 },
    ]);
    await user.click(await screen.findByRole("button", { name: "Use file values" }));
    expect(await screen.findByText(/Port 7778 is already used by Other, so YARK can't take that game port/)).toBeVisible();
    expect(window.api.updateServer).not.toHaveBeenCalled();
  });

  it("discards the INI values by saving the current form", async () => {
    const user = setupUser();
    renderReport(matchingGus.replace("SessionName=Island", "SessionName=Old"));
    await user.click(await screen.findByRole("button", { name: "Keep YARK values" }));
    await waitFor(() => expect(window.api.updateServer).toHaveBeenCalledTimes(1));
    expect(window.api.updateServer).toHaveBeenCalledWith(
      "srv-a",
      expect.objectContaining({ sessionName: "Island", gamePort: 7777 }),
    );
  });
});
