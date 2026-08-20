import type { ServerStatus } from "@shared/types";
import type { ServerUpdateState } from "@shared/server-update-status";
import type { SteamCmdProgressOperation } from "@shared/steamcmd-progress";

/** Runtime control: Play / Stop (leading slot). Hidden when not installed. */
export type ServerCardRuntimeAction = {
  kind: "enable" | "start" | "stop" | "starting" | "stopping";
  label: string;
  color: string;
  variant: "filled" | "light";
  disabled: boolean;
  /** Tooltip when it differs from the button label (e.g. why Start is locked). */
  hint?: string;
  /** False reserves the Play slot (e.g. not installed — Install sits beside kebab). */
  visible: boolean;
};

/** Pause / Resume / Cancel for the SteamCMD job — lives on the progress bar. */
export type ServerCardFilesJobAction = {
  kind: "pause" | "cancel" | "resume";
  label: string;
  color: string;
};

/** Restart icon beside Start/Stop (enabled only while running). */
export type ServerCardRestartAction = {
  label: string;
  color: string;
  variant: "filled" | "light";
  disabled: boolean;
  visible: boolean;
};

/** Install (not installed) or Update (download) — slot beside the kebab. */
export type ServerCardUpdateAction = {
  kind: "install" | "update";
  /** Present when kind is update; drives label/disabled without collapsing to a boolean. */
  updateState: ServerUpdateState | null;
  label: string;
  color: string;
  variant: "filled" | "light";
  disabled: boolean;
  visible: boolean;
};

/** @deprecated Prefer runtimeAction; kept for transitional callers. */
export type ServerCardPrimaryAction = {
  kind:
    | "cancel"
    | "pause"
    | "resume"
    | "enable"
    | "install"
    | "manage"
    | "starting"
    | "stopping"
    | "update"
    | "start"
    | "stop";
  label: string;
  color: string;
  variant: "filled" | "light";
  disabled: boolean;
};

export function resolveRuntimeAction(input: {
  steamCmdBusy: boolean;
  steamCmdPaused?: boolean;
  steamCmdQueued?: boolean;
  steamCmdOperation?: SteamCmdProgressOperation | null;
  isInstallationReady: boolean;
  status: ServerStatus;
  serverEnabled?: boolean;
  /** Optimistic Start click before runtime status becomes starting (#390). */
  startBusy?: boolean;
}): ServerCardRuntimeAction {
  const serverEnabled = input.serverEnabled ?? true;
  const filesLocked =
    input.steamCmdBusy || input.steamCmdPaused === true || input.steamCmdQueued === true;
  const filesLockHint = input.steamCmdQueued === true
    ? "A Downloads job is queued for this server"
    : input.steamCmdPaused === true
      ? "Resume the download before starting this server"
      : input.steamCmdBusy
        ? "Wait until SteamCMD finishes this server"
        : undefined;

  if (filesLocked) {
    if (input.status === "running" || input.status === "starting") {
      return {
        kind: "stop",
        label: "Stop server",
        color: "red",
        variant: "filled",
        disabled: false,
        visible: true,
      };
    }
    if (input.status === "stopping") {
      return {
        kind: "stopping",
        label: "Stopping…",
        color: "red",
        variant: "filled",
        disabled: true,
        visible: true,
      };
    }
    return {
      kind: "start",
      label: "Start server",
      color: "teal",
      variant: "light",
      disabled: true,
      hint: filesLockHint,
      visible: true,
    };
  }
  if (!serverEnabled) {
    return {
      kind: "enable",
      label: "Enable server",
      color: "blue",
      variant: "filled",
      disabled: !input.isInstallationReady,
      visible: true,
    };
  }
  if (!input.isInstallationReady) {
    // Play slot reserved; Install uses the Update slot next to the kebab.
    return {
      kind: "start",
      label: "Start server",
      color: "teal",
      variant: "light",
      disabled: true,
      visible: false,
    };
  }
  if (input.status === "running") {
    return {
      kind: "stop",
      label: "Stop server",
      color: "red",
      variant: "filled",
      disabled: false,
      visible: true,
    };
  }
  if (input.status === "starting") {
    // Keep Stop available as an escape hatch while bootstrapping.
    return {
      kind: "stop",
      label: "Stop server",
      color: "red",
      variant: "filled",
      disabled: false,
      visible: true,
    };
  }
  if (input.status === "stopping") {
    return {
      kind: "stopping",
      label: "Stopping…",
      color: "red",
      variant: "filled",
      disabled: true,
      visible: true,
    };
  }
  if (input.startBusy === true) {
    return {
      kind: "starting",
      label: "Starting…",
      color: "teal",
      variant: "light",
      disabled: true,
      visible: true,
    };
  }
  // error / stopped: Start remains available so a crash does not block relaunch.
  return {
    kind: "start",
    label: "Start server",
    color: "teal",
    variant: "light",
    disabled: false,
    visible: true,
  };
}

export function resolveRestartAction(input: {
  steamCmdBusy: boolean;
  isInstallationReady: boolean;
  status: ServerStatus;
  serverEnabled?: boolean;
  startBusy?: boolean;
}): ServerCardRestartAction {
  const serverEnabled = input.serverEnabled ?? true;
  const transitioning = input.status === "starting" || input.status === "stopping";
  if (!serverEnabled || !input.isInstallationReady) {
    return {
      label: "Restart server",
      color: "gray",
      variant: "light",
      disabled: true,
      visible: false,
    };
  }
  if (input.startBusy === true) {
    return {
      label: "Restarting…",
      color: "fossil",
      variant: "filled",
      disabled: true,
      visible: true,
    };
  }
  return {
    label: "Restart server",
    color: "fossil",
    variant: "filled",
    disabled: input.steamCmdBusy || transitioning || input.status !== "running",
    visible: true,
  };
}

export function resolveUpdateAction(input: {
  steamCmdBusy: boolean;
  isInstallationReady: boolean;
  /** When false, hide Install for suspicious/unknown/inaccessible paths. */
  canOfferInstall?: boolean;
  status: ServerStatus;
  updateState: ServerUpdateState;
  serverEnabled?: boolean;
}): ServerCardUpdateAction {
  const transitioning = input.status === "starting" || input.status === "stopping";
  const active = input.status === "running" || transitioning;
  if (!input.isInstallationReady) {
    const canOfferInstall = input.canOfferInstall !== false;
    return {
      kind: "install",
      updateState: null,
      label: "Install server files",
      color: "blue",
      variant: "light",
      disabled: input.steamCmdBusy || transitioning || !canOfferInstall,
      visible: canOfferInstall,
    };
  }

  if (input.updateState === "available") {
    return {
      kind: "update",
      updateState: "available",
      label: "Update server",
      color: "attention",
      variant: "light",
      disabled: input.steamCmdBusy || active,
      visible: true,
    };
  }

  if (input.updateState === "current") {
    return {
      kind: "update",
      updateState: "current",
      label: "Server is up to date",
      color: "gray",
      variant: "light",
      disabled: true,
      visible: true,
    };
  }

  // unknown (offline / no official build yet): allow a manual update attempt.
  return {
    kind: "update",
    updateState: "unknown",
    label: "Update (couldn't check version)",
    color: "gray",
    variant: "light",
    disabled: input.steamCmdBusy || active,
    visible: true,
  };
}

/** @deprecated Prefer resolveRuntimeAction. */
export function resolvePrimaryAction(input: {
  steamCmdBusy: boolean;
  isInstallationReady: boolean;
  canOfferInstall?: boolean;
  status: ServerStatus;
  updateState: ServerUpdateState;
  serverEnabled?: boolean;
}): ServerCardPrimaryAction {
  const runtime = resolveRuntimeAction(input);
  if (!input.isInstallationReady && !input.steamCmdBusy) {
    const files = resolveUpdateAction(input);
    if (!files.visible) {
      return {
        kind: runtime.kind,
        label: runtime.label,
        color: runtime.color,
        variant: runtime.variant,
        disabled: true,
      };
    }
    return {
      kind: "install",
      label: files.label,
      color: files.color,
      variant: files.variant,
      disabled: files.disabled,
    };
  }
  return {
    kind: runtime.kind,
    label: runtime.label,
    color: runtime.color,
    variant: runtime.variant,
    disabled: runtime.disabled,
  };
}
