import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile } from "@shared/types";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import { JoinInfoModal } from "./JoinInfoModal";

function profile(partial: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-a",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\ark\\a",
    sessionName: "Island Session",
    maxPlayers: 70,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    structuredLaunchArgs: {},
    mods: [],
    disabledMods: [],
    modMetadataCache: {},
    autoStart: false,
    useAsaApi: false,
    useAsaApiLoader: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function renderModal(server: ServerProfile = profile()) {
  const refreshPublicIp = vi.fn(async () => true);
  const rendered = render(
    <AppProviders>
      <JoinInfoModal
        opened
        onClose={vi.fn()}
        server={server}
        publicIp="203.0.113.5"
        refreshPublicIp={refreshPublicIp}
      />
    </AppProviders>,
  );
  return { ...rendered, refreshPublicIp };
}

describe("JoinInfoModal", () => {
  beforeEach(() => {
    window.api = createRendererApiMock();
  });

  it("copies the open command for the shared public IP without a steam:// URI (#505)", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderModal();

    expect(screen.getByText("203.0.113.5")).toBeInTheDocument();
    expect(screen.getByText("open 203.0.113.5:7777")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy in-game command/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("open 203.0.113.5:7777");
    });
    expect(writeText.mock.calls[0]?.[0]).not.toContain("steam://");
  });

  it("keeps the detected IP read-only and lets the operator refresh it", async () => {
    const user = userEvent.setup();
    const { refreshPublicIp } = renderModal();

    await user.click(screen.getByRole("button", { name: /refresh public ip/i }));
    await waitFor(() => {
      expect(refreshPublicIp).toHaveBeenCalledOnce();
    });
    expect(screen.getByText("203.0.113.5")).toBeInTheDocument();
  });

  it("retries detection each time the dialog is reopened while no usable IP exists", async () => {
    const refreshPublicIp = vi.fn(async () => true);
    const { rerender } = render(
      <AppProviders>
        <JoinInfoModal opened onClose={vi.fn()} server={profile()} publicIp="" refreshPublicIp={refreshPublicIp} />
      </AppProviders>,
    );
    await waitFor(() => expect(refreshPublicIp).toHaveBeenCalledOnce());
    rerender(
      <AppProviders>
        <JoinInfoModal
          opened={false}
          onClose={vi.fn()}
          server={profile()}
          publicIp=""
          refreshPublicIp={refreshPublicIp}
        />
      </AppProviders>,
    );
    rerender(
      <AppProviders>
        <JoinInfoModal opened onClose={vi.fn()} server={profile()} publicIp="" refreshPublicIp={refreshPublicIp} />
      </AppProviders>,
    );
    await waitFor(() => expect(refreshPublicIp).toHaveBeenCalledTimes(2));
  });

  it("masks the join password but copies the real value on demand", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderModal(profile({ serverPassword: "hunter2" }));

    expect(screen.getByText("•".repeat(8))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /copy join password/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("hunter2");
    });
  });
});
