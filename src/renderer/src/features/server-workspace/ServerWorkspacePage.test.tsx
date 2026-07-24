import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerWorkspacePage } from "./ServerWorkspacePage";

const serverA = {
  id: "srv-a",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  sessionName: "Island",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "admin",
  clusterId: "cluster-1",
  clusterDir: "C:/ARK/Cluster",
  extraArgs: [],
  mods: ["111"],
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

const serverB = {
  ...serverA,
  id: "srv-b",
  name: "Scorched Earth",
  map: "ScorchedEarth_WP",
  mods: [],
};

function renderWorkspace(onSelectServer = vi.fn()): void {
  render(
    <AppProviders>
      <ServerWorkspacePage
        servers={[serverA, serverB]}
        selectedServerId={serverA.id}
        statuses={new Map()}
        installationInfo={new Map()}
        onSelectServer={onSelectServer}
        onBack={vi.fn()}
        onStartServer={vi.fn()}
        onStopServer={vi.fn()}
        onRestartServer={vi.fn()}
        onKillServer={vi.fn()}
        onOpenFolder={vi.fn()}
        onInstallFiles={vi.fn()}
        onUpdateNow={vi.fn()}
        onVerifyFiles={vi.fn()}
        onSendRcon={vi.fn()}
        onServerUpdated={vi.fn()}
      />
    </AppProviders>,
  );
}

describe("ServerWorkspacePage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal("api", {
      readServerIni: vi.fn(async (serverId: string) => ({
        ok: true,
        data: {
          serverId,
          gameUserSettingsPath: `C:/ARK/${serverId}/GameUserSettings.ini`,
          gameIniPath: `C:/ARK/${serverId}/Game.ini`,
          gameUserSettingsExisted: true,
          gameIniExisted: true,
          payload: {
            gameUserSettings: `[ServerSettings]\nMaxPlayers=70\nAllowFlyerCarryPVE=True\n`,
            game: `[/Script/ShooterGame.ShooterGameMode]\nXPMultiplier=1.0\n`,
          },
        },
      })),
      saveServerIni: vi.fn(async () => ({
        ok: true,
        data: { valid: true, issues: [], diff: [], changedCount: 1 },
      })),
      previewServerIni: vi.fn(async () => ({
        ok: true,
        data: { valid: true, issues: [], diff: [], changedCount: 1 },
      })),
      openServerIniInEditor: vi.fn(async () => ({ ok: true, data: undefined })),
      updateServer: vi.fn(async () => ({ ok: true, data: serverA })),
    });
  });

  it("renders workspace with server list and allows switching servers", async () => {
    const user = userEvent.setup();
    const onSelectServer = vi.fn();

    renderWorkspace(onSelectServer);

    expect(screen.getByText("Todos los servidores")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Island" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Servidor" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Archivos INI" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Mods" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Asistente de configuración" }),
    ).toBeVisible();

    await user.click(screen.getByText("Scorched Earth"));
    expect(onSelectServer).toHaveBeenCalledWith("srv-b");
  });

  it("moves secondary panels into drawers in compact workspaces", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 1599px)",
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    const user = userEvent.setup();
    const onSelectServer = vi.fn();

    renderWorkspace(onSelectServer);

    expect(
      await screen.findByRole("button", { name: "Cambiar servidor" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cambiar servidor" }));
    const serverDialog = await screen.findByRole("dialog", { name: "Cambiar servidor" });
    await waitFor(() => expect(serverDialog).toBeVisible());
    expect(within(serverDialog).getByText("Todos los servidores")).toBeVisible();

    await user.click(within(serverDialog).getByText("Scorched Earth"));
    expect(onSelectServer).toHaveBeenCalledWith("srv-b");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Cambiar servidor" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Estado y acciones" }));
    const actionsDialog = await screen.findByRole("dialog", { name: "Estado y acciones" });
    await waitFor(() => expect(actionsDialog).toBeVisible());
    expect(within(actionsDialog).getByText("Acciones rápidas")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Estado y acciones" })).not.toBeInTheDocument();
    });
  });

  it("shows only available category filters and resets an invalid filter between INI files", async () => {
    const user = userEvent.setup();
    vi.mocked(window.api.readServerIni).mockResolvedValue({
      ok: true,
      data: {
        serverId: serverA.id,
        gameUserSettingsPath: "C:/ARK/srv-a/GameUserSettings.ini",
        gameIniPath: "C:/ARK/srv-a/Game.ini",
        gameUserSettingsExisted: true,
        gameIniExisted: true,
        payload: {
          gameUserSettings: "[SessionSettings]\nSessionName=Test\n",
          game: "[Custom]\nTotallyUnknownSettingXYZ=1\n",
        },
      },
    });
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "Archivos INI" }));
    const fileSelect = screen.getByRole("textbox", { name: "Archivo INI" });
    await user.click(fileSelect);
    await user.click(screen.getByRole("option", { name: "Game.ini" }));
    await waitFor(() => {
      expect(screen.getAllByText("TotallyUnknownSettingXYZ").length).toBeGreaterThan(0);
    });

    const categorySelect = screen.getByRole("textbox", {
      name: "Filtrar por categoría",
    });
    expect(categorySelect).toHaveValue("Todos los ajustes (1)");

    await user.click(categorySelect);
    expect(screen.getByRole("option", { name: "Otros (1)" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Mods/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Otros (1)" }));
    expect(categorySelect).toHaveValue("Otros (1)");

    await user.click(fileSelect);
    await user.click(screen.getByRole("option", { name: "GameUserSettings.ini" }));
    await waitFor(() => {
      expect(screen.getAllByText("SessionName").length).toBeGreaterThan(0);
      expect(categorySelect).toHaveValue("Todos los ajustes (1)");
    });
  });

  it("ignores client settings without showing a warning or pending changes", async () => {
    const user = userEvent.setup();
    vi.mocked(window.api.readServerIni).mockResolvedValue({
      ok: true,
      data: {
        serverId: serverA.id,
        gameUserSettingsPath: "C:/ARK/srv-a/GameUserSettings.ini",
        gameIniPath: "C:/ARK/srv-a/Game.ini",
        gameUserSettingsExisted: true,
        gameIniExisted: true,
        payload: {
          gameUserSettings: [
            "[ServerSettings]",
            "MaxPlayers=70",
            "",
            "[/Script/ShooterGame.ShooterGameUserSettings]",
            "LastJoinedSessionPerCategory=Foo",
            "ResolutionSizeX=1920",
            "",
          ].join("\n"),
          game: "",
        },
      },
    });
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "Archivos INI" }));
    await waitFor(() => {
      expect(screen.getByText("MaxPlayers")).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/Se detectaron claves de cliente o historial/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("LastJoinedSessionPerCategory")).not.toBeInTheDocument();
    expect(screen.queryByText("ResolutionSizeX")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin guardar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("discards an assistant draft without writing INI files", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(
      screen.getByRole("button", { name: "Asistente de configuración" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Prepara la experiencia de juego" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Jugar con amigos/ }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialog = await screen.findByRole("dialog", { name: "Salir del asistente" });
    await user.click(
      within(dialog).getByRole("button", { name: "Descartar borrador" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Información del servidor" }),
    ).toBeVisible();
    expect(window.api.saveServerIni).not.toHaveBeenCalled();
  });

  it("blocks the assistant while the manual INI editor has pending changes", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: "Archivos INI" }));
    const maxPlayers = await screen.findByDisplayValue("70");
    fireEvent.change(maxPlayers, { target: { value: "80" } });
    await user.click(screen.getByRole("tab", { name: "Servidor" }));

    expect(
      screen.getByRole("button", { name: "Asistente de configuración" }),
    ).toBeDisabled();
  });

  it("reviews and explicitly applies the assistant draft", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(
      screen.getByRole("button", { name: "Asistente de configuración" }),
    );
    await user.click(await screen.findByRole("button", { name: /Jugar con amigos/ }));
    await user.click(
      screen.getByRole("switch", {
        name: "Ajustes para una persona o grupo pequeño",
      }),
    );
    await user.click(screen.getByRole("button", { name: /Ver \d+ cambios/ }));
    const changesDialog = await screen.findByRole("dialog", {
      name: "Cambios del borrador",
    });
    expect(within(changesDialog).getByText("Domesticación")).toBeInTheDocument();
    expect(within(changesDialog).getByText("3×")).toBeInTheDocument();
    expect(
      within(changesDialog).getByText("Ajustes para una persona"),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("3× → 7.5×")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("5× → 45×")).toBeVisible();
    expect(screen.getByText("0.5× → 0.075×")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByRole("heading", { name: "Revisa antes de aplicar" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Aplicar cambios" }));

    expect(
      await screen.findByRole("heading", { name: "Configuración aplicada" }),
    ).toBeVisible();
    expect(window.api.previewServerIni).toHaveBeenCalledTimes(1);
    expect(window.api.saveServerIni).toHaveBeenCalledTimes(1);
    // Editor oculto + carga inicial del asistente + relectura previa al guardado.
    expect(window.api.readServerIni).toHaveBeenCalledTimes(3);
    const savedPayload = vi.mocked(window.api.saveServerIni).mock.calls[0]?.[1];
    expect(savedPayload?.gameUserSettings).toContain("TamingSpeedMultiplier=3");
    expect(savedPayload?.game).toContain("BabyMatureSpeedMultiplier=5");
    expect(savedPayload?.game).toContain("bUseSingleplayerSettings=True");
  });
});
