import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerLogsPanel } from "./ServerLogsPanel";

const server = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  sessionName: "The Island Cluster",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "admin",
  clusterId: null,
  clusterDir: null,
  extraArgs: [],
  mods: [],
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

describe("ServerLogsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        listServerLogs: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            serverId: server.id,
            updateFiles: [],
            backups: [],
            events: [
              {
                id: 42,
                serverId: server.id,
                type: "error",
                severity: "error",
                message: "Something broke",
                createdAt: "2026-07-23T10:01:00.000Z",
                details: {
                  what: "Operational failure",
                  cause: "Disk full during backup",
                  location: "D:\\Backups",
                  suggestion: "Free disk space and retry",
                  context: { kind: "world" },
                },
              },
              {
                id: 41,
                serverId: server.id,
                type: "server_started",
                severity: "info",
                message: "Server started",
                createdAt: "2026-07-23T09:00:00.000Z",
                details: null,
              },
            ],
            runtimeLogLines: ["line"],
          },
        }),
        readServerUpdateLog: vi.fn(),
        exportServerLogs: vi.fn(),
        openServerUpdateLogFile: vi.fn(),
        clearServerEvents: vi.fn(),
        clearServerRuntimeLog: vi.fn(),
        deleteServerUpdateLog: vi.fn(),
        clearServerUpdateLogs: vi.fn(),
        deleteBackups: vi.fn(),
        onBackupsChanged: vi.fn(() => () => undefined),
      },
    });
  });

  it("highlights the focused event after load", async () => {
    const onFocusConsumed = vi.fn();
    render(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          focus={{ section: "events", eventId: 42 }}
          onFocusConsumed={onFocusConsumed}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
    const focused = document.querySelector('[data-log-event-id="42"]');
    expect(focused?.className).toMatch(/eventRowFocused/);
    await waitFor(() => {
      expect(onFocusConsumed).toHaveBeenCalled();
    });
  });

  it("forces Events tab when focus includes an eventId even if section is updates", async () => {
    render(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          focus={{ section: "updates", eventId: 42 }}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(document.querySelector('[data-log-event-id="42"]')?.className).toMatch(
      /eventRowFocused/,
    );
  });

  it("expands event details on click and only auto-scrolls once per focus", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <AppProviders>
        <ServerLogsPanel
          server={server}
          embedded
          focus={{ section: "events", eventId: 42 }}
        />
      </AppProviders>,
    );

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
    expect(await screen.findByText(/Disk full during backup/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    const scrollCalls = scrollIntoView.mock.calls.length;

    await user.click(screen.getByRole("tab", { name: "Runtime" }));
    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(scrollIntoView.mock.calls.length).toBe(scrollCalls);

    await user.click(screen.getByRole("button", { name: /Something broke/i }));
    expect(screen.queryByText(/Disk full during backup/i)).not.toBeInTheDocument();
  });
});
