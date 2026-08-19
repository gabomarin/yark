import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { setupUser } from "@renderer/test/setupUser";
import { SidePanel } from "./SidePanel";

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-a",
    name: "The Island",
    map: "TheIsland_WP",
    installDir: "C:/ARK/TheIsland",
    sessionName: "Island",
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
    enabled: true,
    autoStart: false,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

const stopped: ServerRuntimeInfo = {
  serverId: "srv-a",
  status: "stopped",
  processLive: false,
  pid: null,
  startedAt: null,
  lastError: null,
};

function renderPanel(
  extra: Partial<Parameters<typeof SidePanel>[0]> = {},
): {
  onUpdateNow: ReturnType<typeof vi.fn>;
  onToggleEnabled: ReturnType<typeof vi.fn>;
} {
  const onUpdateNow = vi.fn();
  const onToggleEnabled = vi.fn();
  render(
    <AppProviders>
      <SidePanel
        server={profile()}
        runtime={stopped}
        installation={null}
        onOpenFolder={vi.fn()}
        onInstallFiles={vi.fn()}
        onUpdateNow={onUpdateNow}
        onVerifyFiles={vi.fn()}
        onSaveWorld={vi.fn()}
        onCopyConfiguration={vi.fn()}
        onKill={vi.fn()}
        onToggleEnabled={onToggleEnabled}
        {...extra}
      />
    </AppProviders>,
  );
  return { onUpdateNow, onToggleEnabled };
}

describe("SidePanel", () => {
  it("enables Force update when the server is stopped", async () => {
    const user = setupUser();
    const { onUpdateNow } = renderPanel();

    const forceUpdate = screen.getByRole("button", { name: "Force update" });
    expect(forceUpdate).toBeEnabled();
    await user.click(forceUpdate);
    expect(onUpdateNow).toHaveBeenCalledTimes(1);
  });

  it("blocks enable and disable while a SteamCMD job owns the lock", () => {
    renderPanel({
      opsLocked: true,
      opsLockReason: "Updating server files",
    });

    const toggle = screen.getByRole("button", { name: "Disable server" });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("title", "Updating server files");
  });

  it("lets Force update replace a queued Verify without unlocking Disable", async () => {
    const user = setupUser();
    const { onUpdateNow } = renderPanel({
      opsLocked: true,
      opsLockReason: "Queued · Verifying integrity",
      filesJobOperation: "verify-files",
      filesJobQueueKind: "queued",
    });

    expect(screen.getByRole("button", { name: "Disable server" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verify integrity" })).toBeDisabled();
    const update = screen.getByRole("button", { name: "Force update" });
    expect(update).toBeEnabled();
    await user.click(update);
    expect(onUpdateNow).toHaveBeenCalledTimes(1);
  });
});
