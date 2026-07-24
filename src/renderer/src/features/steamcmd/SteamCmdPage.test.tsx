import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { SteamCmdStatus } from "@shared/types";
import { SteamCmdPage } from "./SteamCmdPage";

const readyStatus: SteamCmdStatus = {
  detected: true,
  executablePath: "C:/steamcmd/steamcmd.exe",
  depotCacheDir: "C:/steamcmd/steamapps/depotcache",
  contentCacheDir: "C:/steamcmd/asa_content_cache",
  busy: false,
  running: false,
  operation: null,
  serverId: null,
  startedAt: null,
  pid: null,
  progressPercent: null,
  progressLabel: null,
  progressBytesDownloaded: null,
  progressBytesTotal: null,
  lastLine: null,
  queuedCount: 0,
  checkedAt: "2026-07-23T00:00:00.000Z",
};

describe("SteamCmdPage", () => {
  afterEach(cleanup);

  it("renders state, actions and console", () => {
    render(
      <AppProviders>
        <SteamCmdPage
          steamCmdStatus={readyStatus}
          steamCmdConsole={{
            lines: ["steamcmd ready"],
            updatedAt: "2026-07-23T00:00:00.000Z",
          }}
          officialVersion="358.12"
          onInstallSteamCmd={vi.fn()}
          onPickSteamCmdPath={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("SteamCMD")).toBeInTheDocument();
    expect(screen.getAllByText(/steamcmd ready/i).length).toBeGreaterThan(0);
    expect(screen.getByText("SteamCMD ready")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Depotcache")).toBeInTheDocument();
    expect(screen.getByText(/asa_content_cache/i)).toBeInTheDocument();
    expect(document.querySelector('[data-fill-viewport="true"]')).toBeInTheDocument();
  });

  it("prioritizes active operation progress and cancellation", () => {
    render(
      <AppProviders>
        <SteamCmdPage
          steamCmdStatus={{
            ...readyStatus,
            busy: true,
            running: true,
            operation: "update",
            progressPercent: 42,
            progressLabel: "Downloading",
            progressBytesDownloaded: 536870912,
            progressBytesTotal: 1073741824,
            queuedCount: 1,
          }}
          steamCmdConsole={{ lines: ["Downloading update"], updatedAt: readyStatus.checkedAt }}
          officialVersion="358.12"
          onInstallSteamCmd={vi.fn()}
          onPickSteamCmdPath={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Updating server")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText(/512.0 \/ 1024.0 MB/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel operation/i })).toBeInTheDocument();
  });
});
