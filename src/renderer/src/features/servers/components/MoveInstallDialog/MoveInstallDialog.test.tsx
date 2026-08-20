import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notifications } from "@mantine/notifications";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ImportInstallProbe, ServerInstallationInfo, ServerProfile } from "@shared/types";
import { MoveInstallDialog } from "./MoveInstallDialog";

function installation(
  health: ServerInstallationInfo["health"],
): ServerInstallationInfo {
  return {
    serverId: "probe",
    installed: health === "ready",
    health,
    reasonCodes: [],
    guidance: "",
    build: null,
    steamBuild: null,
    arkVersion: null,
    version: null,
    binaryPath: "C:\\ark\\New\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
    checkedAt: "2026-01-01T00:00:00.000Z",
  };
}

function probeResult(
  installDir: string,
  health: ServerInstallationInfo["health"],
): ImportInstallProbe {
  return {
    installDir,
    installation: installation(health),
    suggestions: {
      name: "New",
      sessionName: "New",
      maxPlayers: 70,
      map: "TheIsland_WP",
      mapModId: null,
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
      adminPassword: "admin",
      serverPassword: null,
      mods: [],
    },
    canContinue: false,
    nestedSubfolder: false,
    suggestedInstallDir: null,
    alreadyManagedBy: null,
  };
}

function profile(partial: Partial<ServerProfile> & Pick<ServerProfile, "id" | "name">): ServerProfile {
  return {
    map: "TheIsland_WP",
    installDir: "C:\\ark\\Island",
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

const island = profile({ id: "island", name: "The Island", installDir: "C:\\ark\\Island" });
const ragnarok = profile({
  id: "rag",
  name: "Ragnarok",
  installDir: "C:\\ark\\Ragnarok",
  map: "Ragnarok_WP",
  gamePort: 7787,
  queryPort: 27025,
  rconPort: 27030,
});

function stubApi(options: {
  pickedDest: string;
  probeHealth?: ServerInstallationInfo["health"];
  probeFailure?: { ok: false; error: string } | "reject";
  moveResult?: {
    oldSourceDir: string;
    oldSourceRemoved: boolean;
    cleanupError: string | null;
  };
}): void {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: {
      probeImportInstall: vi.fn(async (dir: string) => {
        if (options.probeFailure === "reject") {
          throw new Error("disk unreachable");
        }
        if (options.probeFailure !== undefined) {
          return options.probeFailure;
        }
        return {
          ok: true as const,
          data: probeResult(dir, options.probeHealth ?? "missing"),
        };
      }),
      pickPath: vi.fn(async () => ({ ok: true as const, data: options.pickedDest })),
      onMoveInstallProgress: vi.fn(() => () => undefined),
      moveServerInstall: vi.fn(async () => {
        if (options.moveResult !== undefined) {
          return { ok: true as const, data: options.moveResult };
        }
        return { ok: false as const, error: "not stubbed" };
      }),
      dismissMoveServerInstallCleanup: vi.fn(async () => ({ ok: true as const, data: undefined })),
      cancelMoveServerInstall: vi.fn(),
      cleanupMovedServerInstall: vi.fn(),
    },
  });
}

describe("MoveInstallDialog dest preview (#294)", () => {
  beforeEach(() => {
    stubApi({ pickedDest: "C:\\ark\\Scorched" });
  });

  it("blocks Start when dest is inside the current install", async () => {
    const user = userEvent.setup();
    stubApi({ pickedDest: "C:\\ark\\Island\\Backup" });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    expect(await screen.findByText(/inside the current install/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start move/i })).toBeDisabled();
  });

  it("blocks Start when dest is another fleet install", async () => {
    const user = userEvent.setup();
    stubApi({ pickedDest: "C:\\ark\\Ragnarok" });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    expect(await screen.findByText(/inside "Ragnarok"/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start move/i })).toBeDisabled();
  });

  it("enables Start after a missing dest probe", async () => {
    const user = userEvent.setup();
    stubApi({ pickedDest: "C:\\ark\\Scorched", probeHealth: "missing" });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: /start move/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    expect(await screen.findByText("C:\\ark\\Scorched\\Island")).toBeInTheDocument();
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /start move/i })).toBeEnabled();
      },
      { timeout: 2000 },
    );
    expect(window.api.probeImportInstall).toHaveBeenCalledWith("C:\\ark\\Scorched\\Island");
  });

  it("blocks Start when dest is a non-empty ASA tree", async () => {
    const user = userEvent.setup();
    stubApi({ pickedDest: "C:\\ark\\Scorched", probeHealth: "ready" });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    expect(await screen.findByText(/not empty/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start move/i })).toBeDisabled();
  });

  it("nests the current folder name under the picked base when create-folder is on", async () => {
    const user = userEvent.setup();
    stubApi({ pickedDest: "F:\\Diego", probeHealth: "missing" });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("checkbox", { name: /create folder "island"/i })).toBeChecked();
    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    expect(await screen.findByText("F:\\Diego\\Island")).toBeInTheDocument();
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /start move/i })).toBeEnabled();
      },
      { timeout: 2000 },
    );
    expect(window.api.probeImportInstall).toHaveBeenCalledWith("F:\\Diego\\Island");
  });

  it("uses the picked folder as dest when create-folder is off", async () => {
    const user = userEvent.setup();
    stubApi({ pickedDest: "F:\\Diego", probeHealth: "ready" });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("checkbox", { name: /create folder "island"/i }));
    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    expect(await screen.findByText(/not empty/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start move/i })).toBeDisabled();
    expect(window.api.probeImportInstall).toHaveBeenCalledWith("F:\\Diego");
  });

  it("keeps Start disabled when dest probe returns an IPC error", async () => {
    const user = userEvent.setup();
    stubApi({
      pickedDest: "C:\\ark\\Scorched",
      probeFailure: { ok: false, error: "UNC timed out" },
    });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    expect(await screen.findByText(/could not check the destination folder/i)).toBeInTheDocument();
    expect(await screen.findByText(/UNC timed out/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start move/i })).toBeDisabled();
  });

  it("keeps Start disabled when dest probe rejects", async () => {
    const user = userEvent.setup();
    stubApi({ pickedDest: "C:\\ark\\Scorched", probeFailure: "reject" });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    expect(await screen.findByText(/could not check the destination folder/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start move/i })).toBeDisabled();
  });
});

describe("MoveInstallDialog completion feedback (#240)", () => {
  it("toasts on clean success and keeps no green success Alert", async () => {
    const user = userEvent.setup();
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    stubApi({
      pickedDest: "C:\\ark\\Scorched",
      probeHealth: "missing",
      moveResult: {
        oldSourceDir: "C:\\ark\\Island",
        oldSourceRemoved: true,
        cleanupError: null,
      },
    });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start move/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /start move/i }));

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Move completed",
          color: "teal",
        }),
      );
    });
    expect(screen.queryByRole("alert", { name: /move completed/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^done$/i })).toBeInTheDocument();
    notifySpy.mockRestore();
  });

  it("keeps a leftover-folder Alert when the old path was not removed", async () => {
    const user = userEvent.setup();
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    stubApi({
      pickedDest: "C:\\ark\\Scorched",
      probeHealth: "missing",
      moveResult: {
        oldSourceDir: "C:\\ark\\Island",
        oldSourceRemoved: false,
        cleanupError: "Access denied",
      },
    });

    render(
      <AppProviders>
        <MoveInstallDialog
          opened
          server={island}
          servers={[island, ragnarok]}
          onClose={vi.fn()}
          onMoved={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^browse$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start move/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /start move/i }));

    expect(
      await screen.findByRole("alert", { name: /leftover folder/i }),
    ).toBeInTheDocument();
    expect(notifySpy).not.toHaveBeenCalled();
    notifySpy.mockRestore();
  });
});
