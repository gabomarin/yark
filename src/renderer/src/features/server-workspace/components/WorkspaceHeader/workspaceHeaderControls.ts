import type { ServerRuntimeInfo } from "@shared/types";

/** Start / Enable / Stop / Restart lock flags for the workspace header. */
export function workspaceHeaderControls(input: {
  status: ServerRuntimeInfo["status"] | undefined;
  enabled: boolean;
  filesJobActive: boolean;
  filesReady: boolean;
  hasToggleEnabled: boolean;
  startBusy?: boolean;
}): {
  canStart: boolean;
  canEnable: boolean;
  canStop: boolean;
  canRestart: boolean;
} {
  const status = input.status ?? "stopped";
  const isServerDisabled = !input.enabled;
  const filesJobActive = input.filesJobActive;
  const startBusy = input.startBusy === true;
  return {
    canStart:
      (status === "stopped" || status === "error") &&
      !filesJobActive &&
      !isServerDisabled &&
      input.filesReady &&
      !startBusy,
    canEnable: isServerDisabled && input.hasToggleEnabled && !filesJobActive,
    canStop: status === "running" || status === "starting",
    canRestart:
      status === "running" && !filesJobActive && input.filesReady && !startBusy,
  };
}
