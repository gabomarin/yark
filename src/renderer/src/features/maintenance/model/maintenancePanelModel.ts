import type {
  MaintenanceBroadcastPreset,
  MaintenanceJobWarnings,
  MaintenancePolicyStatus,
} from "@shared/types";
import {
  MAINTENANCE_RESTART_PRESET_OFFSETS,
  MAINTENANCE_UPDATE_PRESET_OFFSETS,
} from "@shared/maintenance-policy";

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const CUSTOM_OFFSET_OPTIONS = [
  "30m",
  "15m",
  "5m",
  "1m",
  "10s",
] as const;

export const PRESET_LABELS: Record<
  MaintenanceBroadcastPreset,
  { title: string; hint: string }
> = {
  quiet: { title: "Quiet", hint: "One warning at 5 minutes" },
  standard: { title: "Standard", hint: "A few timed warnings" },
  strict: { title: "Strict", hint: "Standard + final 10 seconds" },
  custom: { title: "Custom", hint: "Pick your own times" },
};

export function formatRestartSummary(policy: MaintenancePolicyStatus): string {
  const day = DAY_LABELS[policy.restartDayOfWeek] ?? "Sunday";
  const presetTitle = PRESET_LABELS[policy.restartWarnings.preset].title;
  if (policy.restartCadence === "daily") {
    return `Daily ${policy.restartTimeLocal} · ${presetTitle} warnings`;
  }
  return `${day} ${policy.restartTimeLocal} · ${presetTitle} warnings`;
}

export function anyJobArmed(policy: MaintenancePolicyStatus): boolean {
  return policy.restartEnabled || policy.wipeEnabled || policy.updateEnabled;
}

export function warningsForPreset(
  kind: "restart" | "update",
  preset: MaintenanceBroadcastPreset,
  previous: MaintenanceJobWarnings,
): MaintenanceJobWarnings {
  if (preset === "custom") {
    return { ...previous, preset: "custom" };
  }
  const table =
    kind === "restart"
      ? MAINTENANCE_RESTART_PRESET_OFFSETS
      : MAINTENANCE_UPDATE_PRESET_OFFSETS;
  return {
    preset,
    customOffsets: [...table[preset]],
    template: previous.template,
  };
}

export function previewWarningMessage(
  template: string,
  previewTime: string,
): string {
  return template.replaceAll("{time}", previewTime);
}
