import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { AppProviders } from "@app/AppProviders";
import type { SteamCmdStatus } from "@shared/types";
import { SettingsPage } from "./SettingsPage";

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

function renderSettings(
  overrides: Partial<ComponentProps<typeof SettingsPage>> = {},
): void {
  render(
    <AppProviders>
      <SettingsPage
        appVersion="0.1.0"
        steamCmdStatus={readyStatus}
        openNativeTerminalOnStart={false}
        onOpenNativeTerminalOnStartChange={vi.fn()}
        uiDensity="compact"
        onUiDensityChange={vi.fn()}
        defaultBaseFolder={null}
        onDefaultBaseFolderChange={vi.fn()}
        onPickSteamCmdPath={vi.fn()}
        onInstallSteamCmd={vi.fn()}
        onOpenSteamCmdCache={vi.fn()}
        onClearSteamCmdCache={vi.fn()}
        {...overrides}
      />
    </AppProviders>,
  );
}

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders compact SteamCMD, general preference, and version footer", async () => {
    vi.stubGlobal("api", {
      listAppDataFolders: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          { kind: "app", label: "App data", path: "C:/Users/me/AppData/Roaming/yark" },
        ],
      }),
      openAppDataFolder: vi.fn(),
      pickPath: vi.fn(),
    });

    renderSettings();

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Display size")).toBeInTheDocument();
    expect(screen.getByLabelText("Display size")).toBeInTheDocument();
    expect(screen.getByText("Default base folder")).toBeInTheDocument();
    expect(document.querySelector("[data-steamcmd-path]")).toHaveTextContent(
      "C:/steamcmd/steamcmd.exe",
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText("Download cache")).not.toBeInTheDocument();
    expect(screen.getByText(/YARK server manager · v0.1.0/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(window.api.listAppDataFolders).toHaveBeenCalled();
    });
  });

  it("notifies when display size changes to Comfortable", async () => {
    const user = userEvent.setup();
    const onUiDensityChange = vi.fn();
    vi.stubGlobal("api", {
      listAppDataFolders: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      openAppDataFolder: vi.fn(),
      pickPath: vi.fn(),
    });

    renderSettings({ onUiDensityChange });

    await user.click(screen.getByRole("radio", { name: "Comfortable" }));
    expect(onUiDensityChange).toHaveBeenCalledWith("comfortable");
  });

  it("expands caches and supports open/clear actions", async () => {
    const user = userEvent.setup();
    const onOpenSteamCmdCache = vi.fn();
    const onClearSteamCmdCache = vi.fn();
    vi.stubGlobal("api", {
      listAppDataFolders: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      openAppDataFolder: vi.fn(),
      pickPath: vi.fn(),
    });

    renderSettings({
      onOpenSteamCmdCache,
      onClearSteamCmdCache,
    });

    await user.click(screen.getByRole("button", { name: /Shared caches/i }));
    expect(screen.getByText("Download cache")).toBeInTheDocument();
    expect(screen.getByText("Shared server files")).toBeInTheDocument();
    expect(
      screen.getByText(/Temporary files Steam already downloaded/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/set up new servers faster/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /^Open$/i })[0]!);
    expect(onOpenSteamCmdCache).toHaveBeenCalledWith("depot");

    await user.click(screen.getAllByRole("button", { name: /^Clear$/i })[2]!);
    expect(onClearSteamCmdCache).toHaveBeenCalledWith("content");
  });

  it("picks and clears default base folder; opens app data folders", async () => {
    const user = userEvent.setup();
    const onDefaultBaseFolderChange = vi.fn();
    const openAppDataFolder = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    vi.stubGlobal("api", {
      listAppDataFolders: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          { kind: "app", label: "App data", path: "C:/Users/me/AppData/Roaming/yark" },
          { kind: "backups", label: "Backups", path: "C:/Users/me/AppData/Roaming/yark/backups" },
        ],
      }),
      openAppDataFolder,
      pickPath: vi.fn().mockResolvedValue({ ok: true, data: "D:/ARK" }),
    });

    renderSettings({
      defaultBaseFolder: null,
      onDefaultBaseFolderChange,
    });

    const baseRow = document.querySelector("[data-default-base-folder]");
    expect(baseRow).not.toBeNull();
    await user.click(
      Array.from(baseRow!.querySelectorAll("button")).find((el) =>
        /Choose/i.test(el.textContent ?? ""),
      )!,
    );
    expect(onDefaultBaseFolderChange).toHaveBeenCalledWith("D:/ARK");

    cleanup();
    renderSettings({
      defaultBaseFolder: "D:/ARK",
      onDefaultBaseFolderChange,
    });
    const baseRowFilled = document.querySelector("[data-default-base-folder]");
    await user.click(
      Array.from(baseRowFilled!.querySelectorAll("button")).find((el) =>
        /^Clear$/i.test(el.textContent ?? ""),
      )!,
    );
    expect(onDefaultBaseFolderChange).toHaveBeenCalledWith(null);

    await user.click(screen.getByRole("button", { name: /App data folders/i }));
    await waitFor(() => {
      expect(screen.getByText("App data")).toBeInTheDocument();
    });
    const dataSection = document.querySelector("[data-app-data-folders]");
    await user.click(
      Array.from(dataSection!.querySelectorAll("button")).find((el) =>
        /^Open$/i.test(el.textContent ?? ""),
      )!,
    );
    expect(openAppDataFolder).toHaveBeenCalledWith("app");
  });

  it("shows install when SteamCMD is missing and toggles native console", async () => {
    const user = userEvent.setup();
    const onOpenNativeTerminalOnStartChange = vi.fn();
    vi.stubGlobal("api", {
      listAppDataFolders: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      openAppDataFolder: vi.fn(),
      pickPath: vi.fn(),
    });

    renderSettings({
      steamCmdStatus: {
        ...readyStatus,
        detected: false,
        executablePath: null,
        depotCacheDir: null,
        contentCacheDir: null,
      },
      onOpenNativeTerminalOnStartChange,
    });

    expect(screen.getByText("Needs setup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Install SteamCMD/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Shared caches/i }));
    expect(screen.getAllByRole("button", { name: /^Open$/i })[0]).toBeDisabled();

    await user.click(
      screen.getByRole("switch", {
        name: /Show native console when starting or restarting a server/i,
      }),
    );
    expect(onOpenNativeTerminalOnStartChange).toHaveBeenCalledWith(true);
  });
});
