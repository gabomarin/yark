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
  status: ServerStatus;
  isInstallationReady: boolean;
  updateAvailable: boolean;
}): ServerCardRowTone {
  if (input.steamCmdBusy) return "busy";
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
    input.steamCmdOperation === "verify-files" ? "Verifying" : "SteamCMD in progress…";
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
}): "muted" | "ok" | "attention" | "busy" | "default" {
  if (input.steamCmdBusy) return "busy";
  if (!input.isInstallationReady) return "muted";
  if (input.updateAvailable) return "attention";
  if (input.updateState === "current") return "ok";
  return "default";
}

/** @deprecated Prefer resolveVersionMetaTone. */
export function resolveFilesMetaTone(input: {
  steamCmdBusy: boolean;
  isInstallationReady: boolean;
  updateAvailable: boolean;
  updateState: ServerUpdateState;
}): "muted" | "ok" | "warn" {
  const tone = resolveVersionMetaTone(input);
  if (tone === "attention" || tone === "busy") return "warn";
  if (tone === "ok") return "ok";
  return "muted";
}

export function deriveServerCardView(input: {
  status: ServerStatus;
  installation: ServerInstallationInfo | null;
  officialSteamBuild: string | null;
  steamCmdBusy: boolean;
  steamCmdOperation: SteamCmdOperation;
  steamCmdProgressLabel: string | null;
  steamCmdProgressBytesDownloaded: number | null;
  steamCmdProgressBytesTotal: number | null;
}) {
  const isInstallationReady = input.installation?.installed === true;
  const localVersion = resolveDisplayedServerVersion(input.installation);
  const updateState = getServerUpdateState(
    input.installation,
    input.officialSteamBuild,
  );
  const updateAvailable = updateState === "available";
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
  });
  const restartAction = resolveRestartAction({
    steamCmdBusy: input.steamCmdBusy,
    isInstallationReady,
    status: input.status,
  });
  const updateAction = resolveUpdateAction({
    steamCmdBusy: input.steamCmdBusy,
    isInstallationReady,
    status: input.status,
    updateState,
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
    installStateLabel,
    runtimeAction,
    restartAction,
    updateAction,
    primaryAction: resolvePrimaryAction({
      steamCmdBusy: input.steamCmdBusy,
      isInstallationReady,
      status: input.status,
      updateState,
    }),
    rowTone: resolveRowTone({
      steamCmdBusy: input.steamCmdBusy,
      status: input.status,
      isInstallationReady,
      updateAvailable,
    }),
    versionMetaTone: resolveVersionMetaTone({
      steamCmdBusy: input.steamCmdBusy,
      isInstallationReady,
      updateAvailable,
      updateState,
    }),
    progress: resolveSteamCmdProgressCopy({
      steamCmdOperation: input.steamCmdOperation,
      steamCmdProgressLabel: input.steamCmdProgressLabel,
      steamCmdProgressBytesDownloaded: input.steamCmdProgressBytesDownloaded,
      steamCmdProgressBytesTotal: input.steamCmdProgressBytesTotal,
    }),
  };
}
