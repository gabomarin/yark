import type { ServerInstallationInfo, ServerStatus } from "@shared/types";
import {
  getServerUpdateState,
  type ServerUpdateState,
} from "@shared/server-update-status";
import { resolveDisplayedServerVersion } from "@shared/server-version-display";
import {
  formatSteamCmdByteProgress,
  hasMeaningfulSteamCmdByteProgress,
  steamCmdByteProgressNoun,
} from "@shared/steamcmd-progress";
import {
  resolvePrimaryAction,
  resolveRestartAction,
  resolveRuntimeAction,
  resolveUpdateAction,
} from "./serverCardActionModel";

export type SteamCmdOperation =
  | "install-steamcmd"
  | "install-files"
  | "update"
  | "sync-files"
  | "verify-files"
  | null;

export type ServerCardRowTone = "busy" | "running" | "error" | "attention" | "stopped";

export function resolveInstallStateLabel(input: {
  steamCmdBusy: boolean;
  steamCmdOperation: SteamCmdOperation;
  isInstallationReady: boolean;
  updateAvailable: boolean;
  updateState: ServerUpdateState;
}): string {
  if (input.steamCmdBusy) {
    if (input.steamCmdOperation === "verify-files") return "Verifying…";
    if (input.steamCmdOperation === "sync-files") return "Copying…";
    if (input.steamCmdOperation === "update") return "Updating…";
    return "Installing…";
  }
  if (!input.isInstallationReady) return "Not installed";
  if (input.updateAvailable) return "Update available";
  if (input.updateState === "current") return "Up to date";
  return "Not verified";
}

export function resolveRowTone(input: {
  steamCmdBusy: boolean;
  stopBusy?: boolean;
  status: ServerStatus;
  isInstallationReady: boolean;
  updateAvailable: boolean;
  serverEnabled?: boolean;
}): ServerCardRowTone {
  if (input.stopBusy === true || input.steamCmdBusy) return "busy";
  if (input.status === "running") return "running";
  if (input.status === "error") return "error";
  if (!input.isInstallationReady || input.updateAvailable) return "attention";
  return "stopped";
}

export function resolveSteamCmdProgressCopy(input: {
  steamCmdOperation: SteamCmdOperation;
  steamCmdProgressLabel: string | null;
  steamCmdProgressBytesDownloaded: number | null;
  steamCmdProgressBytesTotal: number | null;
}): {
  shortProgressLabel: string;
  byteProgressLabel: string | null;
  byteProgressNoun: string;
} {
  const downloaded = input.steamCmdProgressBytesDownloaded;
  const total = input.steamCmdProgressBytesTotal;
  const byteProgressLabel =
    downloaded !== null && total !== null && hasMeaningfulSteamCmdByteProgress(downloaded, total)
      ? formatSteamCmdByteProgress(downloaded, total)
      : null;
  const byteProgressNoun = steamCmdByteProgressNoun(input.steamCmdOperation);
  const fallback =
    input.steamCmdOperation === "verify-files" ? "Verifying" : "Updating files…";
  const shortProgressLabel =
    byteProgressLabel !== null
      ? input.steamCmdProgressLabel?.split(" · ")[0]?.trim() || fallback
      : (input.steamCmdProgressLabel ?? fallback);

  return { shortProgressLabel, byteProgressLabel, byteProgressNoun };
}

export function resolveVersionMetaTone(input: {
  steamCmdBusy: boolean;
  isInstallationReady: boolean;
  updateAvailable: boolean;
  updateState: ServerUpdateState;
  serverEnabled?: boolean;
}): "muted" | "ok" | "attention" | "busy" | "default" {
  if (input.steamCmdBusy) return "busy";
  if (!input.isInstallationReady) return "muted";
  if (input.updateAvailable) return "attention";
  if (input.updateState === "current") return "ok";
  return "default";
}

export function deriveServerCardView(input: {
  status: ServerStatus;
  serverEnabled?: boolean;
  installation: ServerInstallationInfo | null;
  officialSteamBuild: string | null;
  steamCmdBusy: boolean;
  stopBusy?: boolean;
  steamCmdOperation: SteamCmdOperation;
  steamCmdProgressLabel: string | null;
  steamCmdProgressBytesDownloaded: number | null;
  steamCmdProgressBytesTotal: number | null;
  stopProgressLabel?: string | null;
}) {
  const isInstallationReady = input.installation?.installed === true;
  const serverEnabled = input.serverEnabled ?? true;
  const localVersion = resolveDisplayedServerVersion(input.installation);
  const updateState = getServerUpdateState(
    input.installation,
    input.officialSteamBuild,
  );
  const updateAvailable = updateState === "available";
  const stopBusy = input.stopBusy === true;
  const installStateLabel = resolveInstallStateLabel({
    steamCmdBusy: input.steamCmdBusy,
    steamCmdOperation: input.steamCmdOperation,
    isInstallationReady,
    updateAvailable,
    updateState,
  });
  const runtimeAction = resolveRuntimeAction({
    steamCmdBusy: input.steamCmdBusy,
    isInstallationReady,
    status: input.status,
    serverEnabled,
  });
  const restartAction = resolveRestartAction({
    steamCmdBusy: input.steamCmdBusy,
    isInstallationReady,
    status: input.status,
    serverEnabled,
  });
  const updateAction = resolveUpdateAction({
    steamCmdBusy: input.steamCmdBusy,
    isInstallationReady,
    status: input.status,
    serverEnabled,
    updateState,
  });

  const steamProgress = resolveSteamCmdProgressCopy({
    steamCmdOperation: input.steamCmdOperation,
    steamCmdProgressLabel: input.steamCmdProgressLabel,
    steamCmdProgressBytesDownloaded: input.steamCmdProgressBytesDownloaded,
    steamCmdProgressBytesTotal: input.steamCmdProgressBytesTotal,
  });

  return {
    isInstallationReady,
    isActive:
      input.status === "starting" ||
      input.status === "running" ||
      input.status === "stopping",
    localVersion,
    updateState,
    updateAvailable,
    installStateLabel: stopBusy ? "Stopping…" : installStateLabel,
    runtimeAction,
    restartAction,
    updateAction,
    primaryAction: resolvePrimaryAction({
      steamCmdBusy: input.steamCmdBusy,
      isInstallationReady,
      status: input.status,
      updateState,
      serverEnabled: input.serverEnabled,
    }),
    rowTone: resolveRowTone({
      steamCmdBusy: input.steamCmdBusy,
      stopBusy,
      status: input.status,
      isInstallationReady,
      updateAvailable,
      serverEnabled,
    }),
    versionMetaTone: resolveVersionMetaTone({
      steamCmdBusy: input.steamCmdBusy || stopBusy,
      isInstallationReady,
      updateAvailable,
      updateState,
      serverEnabled,
    }),
    progress: stopBusy
      ? {
          shortProgressLabel: input.stopProgressLabel?.trim() || "Stopping…",
          byteProgressLabel: null,
          byteProgressNoun: "Progress",
        }
      : steamProgress,
  };
}
