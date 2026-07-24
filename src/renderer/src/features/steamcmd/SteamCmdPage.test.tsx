import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { SteamCmdPage } from "./SteamCmdPage";

describe("SteamCmdPage", () => {
  it("renders state, actions and console", () => {
    render(
      <AppProviders>
        <SteamCmdPage
          steamCmdStatus={{
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
          }}
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
    expect(screen.getByText(/Progreso/i)).toBeInTheDocument();
    expect(screen.getByText(/Caché de descargas/i)).toBeInTheDocument();
    expect(screen.getByText(/asa_content_cache/i)).toBeInTheDocument();
  });
});
