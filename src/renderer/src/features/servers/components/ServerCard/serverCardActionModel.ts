import type { ServerStatus } from "@shared/types";
import type { ServerUpdateState } from "@shared/server-update-status";

/** Runtime control: Play / Pause / Cancel (leading slot). Hidden when not installed. */
export type ServerCardRuntimeAction = {
  kind: "cancel" | "start" | "stop" | "starting" | "stopping";
  label: string;
  color: string;
  variant: "filled" | "light";
  disabled: boolean;
  /** False reserves the Play slot (e.g. not installed — Install sits beside kebab). */
  visible: boolean;
};

/** Restart icon beside Play/Pause (enabled only while running). */
export type ServerCardRestartAction = {
  label: string;
  color: string;
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
  isInstallationReady: boolean;
  status: ServerStatus;
}): ServerCardRuntimeAction {
  if (input.steamCmdBusy) {
    return {
      kind: "cancel",
      label: "Cancel",
      color: "red",
      variant: "light",
      disabled: false,
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
      color: "gray",
      variant: "light",
      disabled: false,
      visible: true,
    };
  }
  if (input.status === "starting") {
    // Keep Stop available as an escape hatch while bootstrapping.
    return {
      kind: "stop",
      label: "Stop server",
      color: "gray",
      variant: "light",
      disabled: false,
      visible: true,
    };
  }
  if (input.status === "stopping") {
    return {
      kind: "stopping",
      label: "Stopping…",
      color: "gray",
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
}): ServerCardRestartAction {
  const transitioning = input.status === "starting" || input.status === "stopping";
  if (!input.isInstallationReady) {
    return {
      label: "Restart server",
      color: "gray",
      disabled: true,
      visible: false,
    };
  }
  return {
    label: "Restart server",
    color: "gray",
    disabled: input.steamCmdBusy || transitioning || input.status !== "running",
    visible: true,
  };
}

export function resolveUpdateAction(input: {
  steamCmdBusy: boolean;
  isInstallationReady: boolean;
  status: ServerStatus;
  updateState: ServerUpdateState;
}): ServerCardUpdateAction {
  const transitioning = input.status === "starting" || input.status === "stopping";
  if (!input.isInstallationReady) {
    return {
      kind: "install",
      updateState: null,
      label: "Install server files",
      color: "blue",
      variant: "light",
      disabled: input.steamCmdBusy || transitioning,
      visible: true,
    };
  }

  if (input.updateState === "available") {
    return {
      kind: "update",
      updateState: "available",
      label: "Update server",
      color: "attention",
      variant: "light",
      disabled: input.steamCmdBusy || transitioning,
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
    label: "Update status unknown",
    color: "gray",
    variant: "light",
    disabled: input.steamCmdBusy || transitioning,
    visible: true,
  };
}

/** @deprecated Prefer resolveRuntimeAction. */
export function resolvePrimaryAction(input: {
  steamCmdBusy: boolean;
  isInstallationReady: boolean;
  status: ServerStatus;
  updateState: ServerUpdateState;
}): ServerCardPrimaryAction {
  const runtime = resolveRuntimeAction(input);
  if (!input.isInstallationReady && !input.steamCmdBusy) {
    const files = resolveUpdateAction(input);
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
