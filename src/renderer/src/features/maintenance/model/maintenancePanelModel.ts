import type {
  MaintenanceBroadcastPreset,
  MaintenanceJobWarnings,
  MaintenancePolicy,
  MaintenancePolicyStatus,
  ServerInstallationInfo,
  ServerStatus,
} from "@shared/types";
import { isInstallationReady } from "@shared/installation-health";
import { workspaceHeaderControls } from "@features/server-workspace/components/WorkspaceHeader/workspaceHeaderControls";
import {
  MAINTENANCE_RESTART_PRESET_OFFSETS,
  MAINTENANCE_UPDATE_PRESET_OFFSETS,
} from "@shared/maintenance-policy";
import {
  ALL_RESTART_DAYS_OF_WEEK,
  formatRestartDaysSummary,
  normalizeRestartDaysOfWeek,
  RESTART_DAY_SHORT,
} from "@shared/maintenance-restart-days";

export const DAY_SHORT = RESTART_DAY_SHORT;

export const CUSTOM_OFFSET_OPTIONS = [
  "30m",
  "15m",
  "10m",
  "5m",
  "1m",
] as const;

function defaultCustomWarningOffsets(): string[] {
  return [...CUSTOM_OFFSET_OPTIONS];
}

export const PRESET_LABELS: Record<
  MaintenanceBroadcastPreset,
  { title: string; hint: string }
> = {
  none: { title: "Off", hint: "No in-game warnings" },
  quiet: { title: "Minimal", hint: "5 minutes only" },
  standard: { title: "Regular", hint: "" },
  strict: { title: "Frequent", hint: "" },
  custom: { title: "Custom", hint: "Pick your own times" },
};

export const WARNING_PRESET_ORDER: MaintenanceBroadcastPreset[] = [
  "none",
  "quiet",
  "standard",
  "strict",
  "custom",
];

/** Operator-facing trigger line for auto-update summaries (#489). */
export const AUTO_UPDATE_TRIGGER_COPY =
  "when a new Ark server version is available";

/** Chip hint for a built-in warning preset (offset list in plain language). */
export function formatMaintenancePresetHint(
  kind: "restart" | "update",
  preset: Exclude<MaintenanceBroadcastPreset, "custom" | "none">,
): string {
  if (preset === "quiet") return PRESET_LABELS.quiet.hint;
  const table =
    kind === "restart"
      ? MAINTENANCE_RESTART_PRESET_OFFSETS
      : MAINTENANCE_UPDATE_PRESET_OFFSETS;
  return table[preset].map(formatMaintenanceOffsetLabel).join(" · ");
}

function formatMaintenanceOffsetLabel(label: string): string {
  const match = /^(\d+)m$/.exec(label);
  if (match === null) return label;
  const minutes = Number(match[1]);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Writable policy fields only — excludes runtime status (IPC `maintenancePolicyWriteSchema`). */
export function maintenancePolicyWriteFromStatus(
  policy: MaintenancePolicyStatus,
): Omit<MaintenancePolicy, "serverId" | "updatedAt"> {
  return {
    restartEnabled: policy.restartEnabled,
    wipeEnabled: policy.wipeEnabled,
    updateEnabled: policy.updateEnabled,
    restartDaysOfWeek: policy.restartDaysOfWeek,
    restartTimeLocal: policy.restartTimeLocal,
    wipeSaveWorldFirst: true,
    restartWarnings: policy.restartWarnings,
    updateWarnings: policy.updateWarnings,
  };
}

/** Same running-server gate as workspace header Restart, with operator copy. */
export function maintenanceRunRestartNowGate(input: {
  status: ServerStatus;
  enabled: boolean;
  filesJobActive: boolean;
  installation: ServerInstallationInfo | null;
  startBusy?: boolean;
}): { allowed: boolean; reason: string } {
  if (!input.enabled) {
    return { allowed: false, reason: "Server is disabled" };
  }
  if (!isInstallationReady(input.installation)) {
    return {
      allowed: false,
      reason: input.installation?.guidance ?? "Install server files first",
    };
  }
  if (input.filesJobActive) {
    return {
      allowed: false,
      reason: "Wait for file update or stop to finish",
    };
  }
  if (input.startBusy) {
    return { allowed: false, reason: "Start or restart already in progress" };
  }
  if (input.status === "stopped") {
    return { allowed: false, reason: "Server is stopped — start it first" };
  }
  if (input.status === "error") {
    return { allowed: false, reason: "Server crashed — start or fix it first" };
  }
  if (input.status === "starting") {
    return { allowed: false, reason: "Server is still starting" };
  }
  if (input.status === "stopping") {
    return { allowed: false, reason: "Server is stopping" };
  }
  const { canRestart } = workspaceHeaderControls({
    status: input.status,
    enabled: input.enabled,
    filesJobActive: input.filesJobActive,
    filesReady: true,
    hasToggleEnabled: false,
    startBusy: input.startBusy,
  });
  if (canRestart) {
    return { allowed: true, reason: "" };
  }
  return { allowed: false, reason: "Server must be running" };
}

export const MAINTENANCE_RUN_RESTART_NOW_HINT =
  "Scheduled restart flow: warn players in chat (~10s), then graceful restart with backup. Header Restart skips warnings.";

/** Maintenance UI timestamps — 24-hour clock, matches restart schedule picker. */
export function formatMaintenanceLocalDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatRestartSummary(policy: MaintenancePolicyStatus): string {
  const days = formatRestartDaysSummary(policy.restartDaysOfWeek);
  const warningsLabel = formatJobWarningsLabel(policy.restartWarnings);
  return `${days} ${policy.restartTimeLocal} · ${warningsLabel}`;
}

function formatJobWarningsLabel(warnings: MaintenanceJobWarnings): string {
  if (warnings.preset === "none") return "No warnings";
  if (warnings.preset === "custom") return "Custom warnings";
  return `${PRESET_LABELS[warnings.preset].title} warnings`;
}

export function formatRestartUpNextSubtitle(
  policy: MaintenancePolicyStatus,
): string {
  const parts: string[] = [];
  if (policy.nextRestartAt !== null) {
    parts.push(`Next ${formatMaintenanceLocalDateTime(policy.nextRestartAt)}`);
  }
  const warningsHint = formatJobWarningsHint(policy.restartWarnings);
  if (warningsHint !== null) {
    parts.push(warningsHint);
  }
  if (parts.length > 0) return parts.join(" · ");
  return policy.restartWarnings.preset === "none"
    ? "No player warnings before stop"
    : "Players warned before stop";
}

function formatJobWarningsHint(warnings: MaintenanceJobWarnings): string | null {
  if (warnings.preset === "none") return null;
  if (warnings.preset === "custom") return "Custom warnings before stop";
  return `${PRESET_LABELS[warnings.preset].title} warnings before stop`;
}

export function formatUpdateSummary(policy: MaintenancePolicyStatus): string {
  if (!policy.updateEnabled) return "Off";
  const { preset } = policy.updateWarnings;
  if (preset === "none") {
    return `No warnings · ${AUTO_UPDATE_TRIGGER_COPY}`;
  }
  if (preset === "custom") {
    return `Your warning times · ${AUTO_UPDATE_TRIGGER_COPY}`;
  }
  const presetTitle = PRESET_LABELS[preset].title;
  return `${presetTitle} warnings · ${AUTO_UPDATE_TRIGGER_COPY}`;
}

export function anyJobArmed(policy: MaintenancePolicyStatus): boolean {
  return policy.restartEnabled || policy.wipeEnabled || policy.updateEnabled;
}

export function warningsForPreset(
  kind: "restart" | "update",
  preset: MaintenanceBroadcastPreset,
  previous: MaintenanceJobWarnings,
): MaintenanceJobWarnings {
  if (preset === "none") {
    return {
      ...previous,
      preset: "none",
      customOffsets: [],
      lastMinuteChat: false,
    };
  }
  if (preset === "custom") {
    return {
      ...previous,
      preset: "custom",
      customOffsets: defaultCustomWarningOffsets(),
    };
  }
  const table =
    kind === "restart"
      ? MAINTENANCE_RESTART_PRESET_OFFSETS
      : MAINTENANCE_UPDATE_PRESET_OFFSETS;
  return {
    preset,
    customOffsets: [...table[preset]],
    template: previous.template,
    lastMinuteChat: previous.lastMinuteChat,
  };
}

/** Custom chip toggle — empty selection falls back to Off. */
export function toggleCustomWarningOffset(
  warnings: MaintenanceJobWarnings,
  offset: string,
): MaintenanceJobWarnings {
  const on = warnings.customOffsets.includes(offset);
  const customOffsets = on
    ? warnings.customOffsets.filter((x) => x !== offset)
    : [...warnings.customOffsets, offset];
  if (customOffsets.length === 0) {
    return {
      ...warnings,
      preset: "none",
      customOffsets: [],
      lastMinuteChat: false,
    };
  }
  return {
    ...warnings,
    preset: "custom",
    customOffsets,
  };
}

export function previewWarningMessage(
  template: string,
  previewTime: string,
): string {
  return template.replaceAll("{time}", previewTime);
}

export {
  ALL_RESTART_DAYS_OF_WEEK,
  formatRestartDaysSummary,
  normalizeRestartDaysOfWeek,
};
