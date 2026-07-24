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
    expect(screen.getByText(/steamcmd ready/i)).toBeInTheDocument();
    expect(screen.getByText("SteamCMD listo")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
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
            progressLabel: "Descargando",
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

    expect(screen.getByText("Actualizando servidor")).toBeInTheDocument();
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText(/512.0 \/ 1024.0 MB/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelar operación/i })).toBeInTheDocument();
  });
});
