import type { ServerInstallationInfo, ServerStatus } from "@shared/types";
import { getServerUpdateState } from "@shared/server-update-status";
import {
  formatSteamCmdByteProgress,
  hasMeaningfulSteamCmdByteProgress,
  steamCmdByteProgressNoun,
} from "@shared/steamcmd-progress";

export type SteamCmdOperation =
  | "install-steamcmd"
  | "install-files"
  | "update"
  | "sync-files"
  | "verify-files"
  | null;

export type ServerCardRowTone = "busy" | "running" | "error" | "attention" | "stopped";

export type ServerCardPrimaryAction = {
  kind:
    | "cancel"
    | "install"
    | "manage"
    | "starting"
    | "stopping"
    | "review-error"
    | "update"
    | "start";
  label: string;
  color: string;
  variant: "filled" | "light";
  disabled: boolean;
};

export function resolveInstallStateLabel(input: {
  steamCmdBusy: boolean;
  steamCmdOperation: SteamCmdOperation;
  isInstallationReady: boolean;
  updateAvailable: boolean;
  updateState: ReturnType<typeof getServerUpdateState>;
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

export function resolvePrimaryAction(input: {
  steamCmdBusy: boolean;
  isInstallationReady: boolean;
  status: ServerStatus;
  updateAvailable: boolean;
}): ServerCardPrimaryAction {
  if (input.steamCmdBusy) {
    return {
      kind: "cancel",
      label: "Cancel",
      color: "red",
      variant: "light",
      disabled: false,
    };
  }
  if (!input.isInstallationReady) {
    return {
      kind: "install",
      label: "Install",
      color: "blue",
      variant: "filled",
      disabled: false,
    };
  }
  if (input.status === "running") {
    return {
      kind: "manage",
      label: "Manage",
      color: "blue",
      variant: "filled",
      disabled: false,
    };
  }
  if (input.status === "starting") {
    return {
      kind: "starting",
      label: "Starting…",
      color: "blue",
      variant: "light",
      disabled: true,
    };
  }
  if (input.status === "stopping") {
    return {
      kind: "stopping",
      label: "Stopping…",
      color: "gray",
      variant: "light",
      disabled: true,
    };
  }
  if (input.status === "error") {
    return {
      kind: "review-error",
      label: "Review error",
      color: "red",
      variant: "light",
      disabled: false,
    };
  }
  if (input.updateAvailable) {
    return {
      kind: "update",
      label: "Update",
      color: "orange",
      variant: "light",
      disabled: false,
    };
  }
  return {
    kind: "start",
    label: "Start",
    color: "teal",
    variant: "light",
    disabled: false,
  };
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

export function resolveFilesMetaTone(input: {
  steamCmdBusy: boolean;
  isInstallationReady: boolean;
  updateAvailable: boolean;
  updateState: ReturnType<typeof getServerUpdateState>;
}): "muted" | "ok" | "warn" {
  if (input.steamCmdBusy || !input.isInstallationReady || input.updateAvailable) {
    return "warn";
  }
  if (input.updateState === "current") return "ok";
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
  const localVersion =
    input.installation?.arkVersion ?? input.installation?.build ?? null;
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
    primaryAction: resolvePrimaryAction({
      steamCmdBusy: input.steamCmdBusy,
      isInstallationReady,
      status: input.status,
      updateAvailable,
    }),
    rowTone: resolveRowTone({
      steamCmdBusy: input.steamCmdBusy,
      status: input.status,
      isInstallationReady,
      updateAvailable,
    }),
    filesMetaTone: resolveFilesMetaTone({
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
