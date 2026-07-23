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
            running: false,
            operation: null,
            serverId: null,
            startedAt: null,
            pid: null,
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
    expect(screen.getByText(/Versión oficial/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Elegir steamcmd.exe/i })).toBeInTheDocument();
  });
});