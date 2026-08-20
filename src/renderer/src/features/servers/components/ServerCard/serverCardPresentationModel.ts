import type { ServerInstallationInfo, ServerStatus } from "@shared/types";
import {
  installationHealthLabel,
  isInstallOfferHealth,
  isInstallationReady,
} from "@shared/installation-health";
import {
  getServerUpdateState,
  type ServerUpdateState,
} from "@shared/server-update-status";
import { resolveDisplayedServerVersion, shouldHintVersionRefreshesOnStart, VERSION_REFRESHES_ON_START_HINT } from "@shared/server-version-display";
import {
  formatSteamCmdByteProgress,
  hasMeaningfulSteamCmdByteProgress,
  steamCmdByteProgressNoun,
  steamCmdProgressFallbackLabel,
} from "@shared/steamcmd-progress";
import {
  resolvePrimaryAction,
  resolveRestartAction,
  resolveRuntimeAction,
  resolveUpdateAction,
} from "./serverCardActionModel";
import {
  canEnqueueFilesJobFromMenu,
  filesJobOccupantFromUi,
} from "@shared/files-job-priority";

export type SteamCmdOperation =
  | "install-steamcmd"
  | "install-files"
  | "update"
  | "sync-files"
  | "verify-files"
  | null;

export type ServerCardRowTone = "busy" | "queued" | "running" | "error" | "attention" | "stopped";

export function resolveInstallStateLabel(input: {
  steamCmdBusy: boolean;
  steamCmdPaused?: boolean;
  steamCmdQueued?: boolean;
  steamCmdOperation: SteamCmdOperation;
  isInstallationReady: boolean;
  installation: ServerInstallationInfo | null;
  updateAvailable: boolean;
  updateState: ServerUpdateState;
}): string {
  if (input.steamCmdBusy) {
    if (input.steamCmdOperation === "verify-files") return "Verifying…";
    if (input.steamCmdOperation === "sync-files") return "Copying…";
    if (input.steamCmdOperation === "update") return "Updating…";
    return "Installing…";
  }
  if (input.steamCmdPaused === true) {
    return "Paused";
  }
  if (input.steamCmdQueued === true) {
    return "Queued";
  }
  if (!input.isInstallationReady) {
    return installationHealthLabel(input.installation?.health);
  }
  if (input.updateAvailable) return "Update available";
  if (input.updateState === "current") return "Up to date";
  return "Not verified";
}

export function resolveRowTone(input: {
  steamCmdBusy: boolean;
  steamCmdPaused?: boolean;
  steamCmdQueued?: boolean;
  stopBusy?: boolean;
  status: ServerStatus;
  isInstallationReady: boolean;
  updateAvailable: boolean;
  serverEnabled?: boolean;
}): ServerCardRowTone {
  if (input.stopBusy === true || input.steamCmdBusy || input.steamCmdPaused === true) return "busy";
  if (input.steamCmdQueued === true) return "queued";
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
  const fallback = steamCmdProgressFallbackLabel(input.steamCmdOperation);
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
  officialVersion?: string | null;
  steamCmdBusy: boolean;
  steamCmdPaused?: boolean;
  steamCmdQueued?: boolean;
  stopBusy?: boolean;
  startBusy?: boolean;
  steamCmdOperation: SteamCmdOperation;
  steamCmdProgressLabel: string | null;
  steamCmdProgressBytesDownloaded: number | null;
  steamCmdProgressBytesTotal: number | null;
  stopProgressLabel?: string | null;
}) {
  const ready = isInstallationReady(input.installation);
  const canOfferInstall = isInstallOfferHealth(input.installation?.health);
  const serverEnabled = input.serverEnabled ?? true;
  const localVersion = resolveDisplayedServerVersion(input.installation);
  const updateState = getServerUpdateState(
    input.installation,
    input.officialSteamBuild,
  );
  const updateAvailable = updateState === "available";
  const versionRefreshHint = shouldHintVersionRefreshesOnStart({
    updateState,
    localVersion,
    officialVersion: input.officialVersion,
  })
    ? VERSION_REFRESHES_ON_START_HINT
    : null;
  const stopBusy = input.stopBusy === true;
  const startBusy = input.startBusy === true;
  const steamCmdPaused = input.steamCmdPaused === true;
  const steamCmdQueued = input.steamCmdQueued === true;
  const filesLocked = input.steamCmdBusy || steamCmdPaused || steamCmdQueued;
  const filesOccupant = filesJobOccupantFromUi({
    busy: input.steamCmdBusy,
    paused: steamCmdPaused,
    queued: steamCmdQueued,
    operation: input.steamCmdOperation,
  });
  const updateSlotBusy = !canEnqueueFilesJobFromMenu(
    ready ? "update" : "install-files",
    filesOccupant,
  );
  const installStateLabel = resolveInstallStateLabel({
    steamCmdBusy: input.steamCmdBusy,
    steamCmdPaused,
    steamCmdQueued,
    steamCmdOperation: input.steamCmdOperation,
    isInstallationReady: ready,
    installation: input.installation,
    updateAvailable,
    updateState,
  });
  const runtimeAction = resolveRuntimeAction({
    steamCmdBusy: input.steamCmdBusy,
    steamCmdPaused,
    steamCmdQueued,
    steamCmdOperation: input.steamCmdOperation,
    isInstallationReady: ready,
    status: input.status,
    serverEnabled,
    startBusy,
  });
  const restartAction = resolveRestartAction({
    steamCmdBusy: filesLocked,
    isInstallationReady: ready,
    status: input.status,
    serverEnabled,
    startBusy,
  });
  const updateAction = resolveUpdateAction({
    steamCmdBusy: updateSlotBusy,
    isInstallationReady: ready,
    canOfferInstall,
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
    isInstallationReady: ready,
    canOfferInstall,
    isActive:
      input.status === "starting" ||
      input.status === "running" ||
      input.status === "stopping",
    localVersion,
    versionRefreshHint,
    updateState,
    updateAvailable,
    installStateLabel: stopBusy ? "Stopping…" : installStateLabel,
    runtimeAction,
    restartAction,
    updateAction,
    verifyFilesLocked: !canEnqueueFilesJobFromMenu("verify-files", filesOccupant),
    installFilesLocked: !canEnqueueFilesJobFromMenu("install-files", filesOccupant),
    primaryAction: resolvePrimaryAction({
      steamCmdBusy: filesLocked,
      isInstallationReady: ready,
      canOfferInstall,
      status: input.status,
      updateState,
      serverEnabled,
    }),
    rowTone: resolveRowTone({
      steamCmdBusy: input.steamCmdBusy,
      steamCmdPaused,
      steamCmdQueued,
      stopBusy,
      status: input.status,
      isInstallationReady: ready,
      updateAvailable,
      serverEnabled,
    }),
    versionMetaTone: resolveVersionMetaTone({
      steamCmdBusy: filesLocked || stopBusy,
      isInstallationReady: ready,
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
