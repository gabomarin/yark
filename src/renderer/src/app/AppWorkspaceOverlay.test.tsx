import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppWorkspaceOverlay } from "./AppWorkspaceOverlay";

const { deleteServer, refresh, setOverlay } = vi.hoisted(() => ({
  deleteServer: vi.fn(),
  refresh: vi.fn(),
  setOverlay: vi.fn(),
}));

vi.mock("@app/appShellChrome", () => ({
  AppShellWithChrome: ({ children }: { children: unknown }) => <>{children}</>,
}));

vi.mock("@features/server-workspace/ServerWorkspacePage", () => ({
  ServerWorkspacePage: ({ onDeleteServer }: { onDeleteServer?: (serverId: string) => void }) => (
    <button onClick={() => onDeleteServer?.("srv-a")}>Delete from Quick actions</button>
  ),
}));

vi.mock("@features/servers/components/DeleteServerModal/DeleteServerModal", () => ({
  DeleteServerModal: ({
    opened,
    onConfirm,
  }: {
    opened: boolean;
    onConfirm: (options: { deleteInstallFiles: boolean }) => Promise<{ ok: boolean }>;
  }) => (opened ? <button onClick={() => void onConfirm({ deleteInstallFiles: false })}>Confirm delete</button> : null),
}));

describe("AppWorkspaceOverlay", () => {
  it("confirms Quick actions deletion through the overlay-owned modal", async () => {
    deleteServer.mockResolvedValue({ ok: true });
    refresh.mockResolvedValue(undefined);
    window.api = { ...window.api, deleteServer } as typeof window.api;

    render(
      <AppWorkspaceOverlay
        shell={{} as never}
        overlay={{ kind: "workspace", serverId: "srv-a" }}
        setOverlay={setOverlay}
        fleet={
          {
            servers: [{ id: "srv-a", name: "The Island", installDir: "C:\\ARK" }],
            statuses: new Map(),
            installationInfo: new Map(),
            processMetricsByServer: new Map(),
            events: [],
            refresh,
          } as never
        }
        lifecycle={{
          stopProgressByServerId: new Map(),
          startBusyByServerId: new Set(),
          actions: {} as never,
        }}
        rcon={{
          rconHistoryByServer: new Map(),
          playerListsByServer: new Map(),
          sendRconCommand: vi.fn(),
          clearRconHistory: vi.fn(),
          onRconTabFocusChanged: vi.fn(),
          onRefreshPlayers: vi.fn(),
          onKickPlayer: vi.fn(),
          onBanPlayer: vi.fn(),
        }}
        steamCmd={
          {
            filesQueueByServerId: new Map(),
            steamCmdStatus: null,
            steamCmdBusy: false,
            startSteamFilesJob: vi.fn(),
          } as never
        }
        registerOverlayLeaveGuard={vi.fn()}
        hostedResourceReferencesByServerId={new Map()}
      />,
    );

    await screen.findByRole("button", { name: "Delete from Quick actions" }).then((button) => button.click());
    await screen.findByRole("button", { name: "Confirm delete" }).then((button) => button.click());

    expect(deleteServer).toHaveBeenCalledWith("srv-a", { deleteInstallFiles: false });
    expect(refresh).toHaveBeenCalledWith({ includeInstallation: true });
    await waitFor(() => {
      expect(setOverlay).toHaveBeenCalledWith(null);
    });
  });
});
