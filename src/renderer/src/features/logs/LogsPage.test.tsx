import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import { LogsPage } from "./LogsPage";

const server = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  sessionName: "The Island Cluster",
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
};

describe("LogsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    const api = createRendererApiMock({
      recentEvents: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          {
            id: 99,
            serverId: server.id,
            type: "update_failed",
            severity: "error",
            message: "Update failed on Island",
            createdAt: new Date().toISOString(),
            details: null,
          },
        ],
      }),
    });

    Object.defineProperty(window, "api", {
      configurable: true,
      value: api,
    });
  });

  it("shows problems across servers and opens the matching server logs focus", async () => {
    const onOpenServerLogs = vi.fn();
    const user = userEvent.setup();
    render(
      <AppProviders>
        <LogsPage servers={[server]} onOpenServerLogs={onOpenServerLogs} />
      </AppProviders>,
    );

    expect(await screen.findByText("Activity across servers")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Severity filter" })).toHaveValue(
      "All severity",
    );
    expect(await screen.findByText(/Update failed on Island/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Update failed on Island/i }));
    expect(
      await screen.findByText(/A SteamCMD install, update, or verify job failed/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Open in server/i }));
    expect(onOpenServerLogs).toHaveBeenCalledWith(
      server.id,
      expect.objectContaining({
        section: "events",
        eventId: 99,
      }),
    );
  });

  it("labels activity from a disabled server as inactive", async () => {
    render(
      <AppProviders>
        <LogsPage
          servers={[{ ...server, enabled: false }]}
          onOpenServerLogs={vi.fn()}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });

  it("does not reload fleet events when servers prop identity changes", async () => {
    const recentEvents = vi.mocked(window.api.recentEvents);
    const { rerender } = render(
      <AppProviders>
        <LogsPage servers={[server]} onOpenServerLogs={vi.fn()} />
      </AppProviders>,
    );

    expect(await screen.findByText(/Update failed on Island/i)).toBeInTheDocument();
    expect(recentEvents).toHaveBeenCalledTimes(1);

    rerender(
      <AppProviders>
        <LogsPage
          servers={[{ ...server }]}
          onOpenServerLogs={vi.fn()}
        />
      </AppProviders>,
    );

    await screen.findByText(/Update failed on Island/i);
    expect(recentEvents).toHaveBeenCalledTimes(1);
  });
});
