import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerCard } from "./ServerCard";

afterEach(cleanup);

const profile = {
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
  enabled: true,
  autoStart: false,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

const installed = {
  serverId: profile.id,
  installed: true,
  health: "ready" as const,
  reasonCodes: ["ready"],
  guidance: "Installation looks ready to start.",
  build: null,
  steamBuild: null,
  arkVersion: null,
  version: null,
  binaryPath: "C:/ARK/TheIsland/ShooterGame/Binaries/Win64/ArkAscendedServer.exe",
  checkedAt: "2026-07-23T00:00:00.000Z",
};

describe("ServerCard", () => {
  it("uses Start as the primary action for an installed stopped server", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onOpenWorkspace = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={installed}
          officialSteamBuild={null}
          onStart={onStart}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={onOpenWorkspace}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^Start server$/i }));
    expect(onStart).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Open settings for The Island/i }));
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
  });

  it("shows an inactive badge and enable action for a disabled profile", async () => {
    const user = userEvent.setup();
    const onToggleEnabled = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={{ ...profile, enabled: false }}
          runtime={null}
          installation={installed}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onToggleEnabled={onToggleEnabled}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Inactive")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Enable server$/i }));
    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
  });

  it("uses Stop for a running server and keeps secondary actions in the menu", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    const onOpenWorkspace = vi.fn();

    const { container } = render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={{
            serverId: profile.id,
            status: "running",
            pid: 1234,
            startedAt: "2026-07-23T00:00:00.000Z",
            lastError: null,
          }}
          installation={installed}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={onStop}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={onOpenWorkspace}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    const card = within(container);
    await user.click(card.getByRole("button", { name: /^Stop server$/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(card.queryByRole("button", { name: /^Start server$/i })).not.toBeInTheDocument();
    expect(card.getByRole("button", { name: /^Restart server$/i })).toBeEnabled();

    await user.click(card.getByRole("button", { name: "More options" }));
    expect(
      await screen.findByRole("menuitem", { name: "Stop safely" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Restart" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open folder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete server$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Force close \(matar\)$/i })).not.toBeInTheDocument();
  });

  it("opens the same actions from a right-click context menu", async () => {
    const user = userEvent.setup();
    const onOpenFolder = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={{
            serverId: profile.id,
            status: "running",
            pid: 1234,
            startedAt: "2026-07-23T00:00:00.000Z",
            lastError: null,
          }}
          installation={installed}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={onOpenFolder}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    const card = document.querySelector("[data-server-card]");
    expect(card).not.toBeNull();
    fireEvent.contextMenu(card!);

    const openFolder = await screen.findByRole("menuitem", { name: /^Open folder$/ });
    expect(screen.getByRole("menuitem", { name: /^Stop safely$/ })).toBeInTheDocument();
    await user.click(openFolder);
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });

  it("does not claim right-click while SteamCMD owns the server lock", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={installed}
          officialSteamBuild={null}
          steamCmdBusy
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    const card = document.querySelector("[data-server-card]");
    expect(card).not.toBeNull();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 20,
    });
    card!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("menuitem", { name: /^Open folder$/ })).not.toBeInTheDocument();
  });

  it("puts Install beside the kebab and reserves Play/Restart when not installed", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            installed: false,
            health: "missing",
            reasonCodes: ["path_missing"],
            guidance: "Create the folder or correct the install path, then install server files.",
          }}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    const install = screen.getByRole("button", { name: /Install server files/i });
    expect(install).toBeInTheDocument();
    expect(install).toHaveAttribute("data-files-action", "install");
    expect(document.querySelector("[data-primary-action][data-reserved]")).not.toBeNull();
    expect(document.querySelector("[data-restart-action][data-reserved]")).not.toBeNull();
    expect(document.querySelector("[data-update-action][data-reserved]")).toBeNull();
  });

  it("hides Install for suspicious installs in the files slot and kebab menu", async () => {
    const user = userEvent.setup();
    const onInstallFiles = vi.fn();

    const { container } = render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            installed: false,
            health: "suspicious",
            reasonCodes: ["foreign_contents"],
            guidance:
              "This folder already has unrelated files. Point the profile at an empty folder or a real ASA install before installing.",
          }}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={onInstallFiles}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("button", { name: /Install server files/i })).not.toBeInTheDocument();
    await user.click(within(container).getByRole("button", { name: "More options" }));
    expect(screen.queryByRole("menuitem", { name: "Install files" })).not.toBeInTheDocument();
    expect(onInstallFiles).not.toHaveBeenCalled();
  });

  it("uses Install in the files slot when server files are missing", async () => {
    const user = userEvent.setup();
    const onInstallFiles = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            installed: false,
            health: "missing",
            reasonCodes: ["path_missing"],
            guidance: "Create the folder or correct the install path, then install server files.",
          }}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={onInstallFiles}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /Install server files/i }));
    expect(onInstallFiles).toHaveBeenCalledTimes(1);
  });

  it("shows progress bar while SteamCMD is busy", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            installed: false,
            health: "missing",
            reasonCodes: ["path_missing"],
            guidance: "Create the folder or correct the install path, then install server files.",
          }}
          officialSteamBuild={null}
          steamCmdBusy
          steamCmdProgressPercent={42}
          steamCmdProgressLabel="Downloading · 512.0 / 1024.0 MB"
          steamCmdProgressBytesDownloaded={536870912}
          steamCmdProgressBytesTotal={1073741824}
          steamCmdOperation="install-files"
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getAllByText(/Installing/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Downloading$/i)).toBeInTheDocument();
    expect(screen.getByText(/Downloaded:/i)).toBeInTheDocument();
    expect(screen.getByText(/512\.0 \/ 1024\.0 MB/i)).toBeInTheDocument();
    expect(screen.getByText(/42%/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument();
  });

  it("does not offer an update when ARK versions differ but Steam builds match", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            arkVersion: "92.21",
            steamBuild: "build 24346423",
          }}
          officialSteamBuild="build 24346423"
          officialVersion="92.28"
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    const versionMeta = document.querySelector('[data-meta-label="Version"]');
    expect(versionMeta).toHaveAttribute("data-meta-tone", "ok");
    expect(versionMeta).toHaveAttribute("data-meta-hint", "true");
    expect(screen.getByRole("button", { name: /^Start server$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Server is up to date/i })).toBeDisabled();
  });

  it("keeps Start available when the Steam build is behind and enables Update", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onUpdateNow = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            arkVersion: "92.23",
            build: "92.23",
            steamBuild: "build 24300000",
          }}
          officialSteamBuild="build 24346423"
          onStart={onStart}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={onUpdateNow}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(document.querySelector('[data-meta-label="Version"]')).toHaveAttribute(
      "data-meta-tone",
      "attention",
    );
    expect(screen.getByText("92.23")).toBeInTheDocument();
    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Start server$/i })).toBeEnabled();
    const update = screen.getByRole("button", { name: /^Update server$/i });
    expect(update).toBeEnabled();
    await user.click(update);
    expect(onUpdateNow).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /^Start server$/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("marks Version muted when server files are not installed", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            installed: false,
            health: "missing",
            reasonCodes: ["path_missing"],
            guidance: "Create the folder or correct the install path, then install server files.",
          }}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(document.querySelector('[data-meta-label="Version"]')).toHaveAttribute(
      "data-meta-tone",
      "muted",
    );
    expect(screen.queryByText("Not installed")).not.toBeInTheDocument();
  });

  it("prefers file build over stale log arkVersion for the Version column", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            arkVersion: "92.25",
            build: "92.28",
            version: "92.28",
            steamBuild: "build 24346423",
          }}
          officialSteamBuild="build 24346423"
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("92.28")).toBeInTheDocument();
    expect(screen.queryByText("92.25")).not.toBeInTheDocument();
  });

  it("disables Restart and Update while the server is starting, but keeps Stop", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={{
            serverId: profile.id,
            status: "starting",
            pid: null,
            startedAt: null,
            lastError: null,
          }}
          installation={{
            ...installed,
            arkVersion: "92.23",
            steamBuild: "build 24300000",
          }}
          officialSteamBuild="build 24346423"
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: /^Stop server$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Restart server$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Update server$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More options" })).toBeEnabled();
  });

  it("keeps Cancel enabled while SteamCMD is busy even if the server is stopping", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={{
            serverId: profile.id,
            status: "stopping",
            pid: 99,
            startedAt: "2026-07-23T00:00:00.000Z",
            lastError: null,
          }}
          installation={installed}
          officialSteamBuild="build 24346423"
          steamCmdBusy
          steamCmdOperation="update"
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeEnabled();
  });

  it("allows manual Update when official Steam build is unknown", async () => {
    const user = userEvent.setup();
    const onUpdateNow = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={{
            ...installed,
            build: "92.28",
            steamBuild: "build 24300000",
          }}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={onUpdateNow}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    const update = screen.getByRole("button", { name: /Update \(couldn't check version\)/i });
    expect(update).toBeEnabled();
    await user.click(update);
    expect(onUpdateNow).toHaveBeenCalledTimes(1);
  });

  it("keeps Start after an error and routes review through the error label", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onReviewError = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={{
            serverId: profile.id,
            status: "error",
            pid: null,
            startedAt: null,
            lastError: "Native console closed during startup",
          }}
          installation={installed}
          officialSteamBuild={null}
          onStart={onStart}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={onReviewError}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("button", { name: /^Review error$/i })).not.toBeInTheDocument();
    const start = screen.getByRole("button", { name: /^Start server$/i });
    expect(start).toBeEnabled();
    await user.click(start);
    expect(onStart).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /Review error — open runtime logs/i }),
    );
    expect(onReviewError).toHaveBeenCalledTimes(1);
  });

  it("enables Restart only while the server is running", async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();

    const { rerender } = render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={installed}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={onRestart}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: /^Restart server$/i })).toBeDisabled();

    rerender(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={{
            serverId: profile.id,
            status: "running",
            pid: 4242,
            startedAt: "2026-07-23T00:00:00.000Z",
            lastError: null,
          }}
          installation={installed}
          officialSteamBuild={null}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={onRestart}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    const restart = screen.getByRole("button", { name: /^Restart server$/i });
    expect(restart).toBeEnabled();
    await user.click(restart);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("shows stop progress label and percent while a safe stop is running", () => {
    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={{
            serverId: profile.id,
            status: "stopping",
            pid: 99,
            startedAt: "2026-07-23T00:00:00.000Z",
            lastError: null,
          }}
          installation={installed}
          officialSteamBuild="build 24346423"
          stopBusy
          stopProgressPercent={50}
          stopProgressLabel="Backing up world save…"
          onStart={vi.fn()}
          onStop={vi.fn()}
          onKill={vi.fn()}
          onRestart={vi.fn()}
          onOpenWorkspace={vi.fn()}
          onOpenLogs={vi.fn()}
          onReviewError={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onVerifyFiles={vi.fn()}
          onCheckUpdates={vi.fn()}
          onClone={vi.fn()}
          onCopyConfiguration={vi.fn()}
          onDelete={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Backing up world save…")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Stopping…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options" })).toBeDisabled();
  });
});
