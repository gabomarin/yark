import type {
  MaintenanceBroadcastPreset,
  MaintenanceJobWarnings,
  MaintenancePolicy,
} from "./types";

/** Minimal / Regular / Frequent offset lists (long window; last minute optional via `lastMinuteChat`). */
export const MAINTENANCE_RESTART_PRESET_OFFSETS: Record<
  Exclude<MaintenanceBroadcastPreset, "custom" | "none">,
  readonly string[]
> = {
  quiet: ["5m"],
  standard: ["30m", "15m", "5m", "1m"],
  strict: ["30m", "15m", "10m", "5m", "1m"],
};

/** Shorter defaults for auto-update warnings. */
export const MAINTENANCE_UPDATE_PRESET_OFFSETS: Record<
  Exclude<MaintenanceBroadcastPreset, "custom" | "none">,
  readonly string[]
> = {
  quiet: ["5m"],
  standard: ["15m", "5m", "1m"],
  strict: ["15m", "10m", "5m", "1m"],
};

export const DEFAULT_RESTART_WARNINGS: MaintenanceJobWarnings = {
  preset: "standard",
  customOffsets: [...MAINTENANCE_RESTART_PRESET_OFFSETS.standard],
  template: "Server restart in {time}",
  lastMinuteChat: true,
};

export const DEFAULT_UPDATE_WARNINGS: MaintenanceJobWarnings = {
  preset: "standard",
  customOffsets: [...MAINTENANCE_UPDATE_PRESET_OFFSETS.standard],
  template: "Server update in {time}",
  lastMinuteChat: true,
};

export function defaultMaintenancePolicy(serverId: string, updatedAt: string): MaintenancePolicy {
  return {
    serverId,
    restartEnabled: false,
    wipeEnabled: false,
    updateEnabled: false,
    restartDaysOfWeek: [0],
    restartTimeLocal: "04:00",
    wipeSaveWorldFirst: true,
    restartWarnings: { ...DEFAULT_RESTART_WARNINGS, customOffsets: [...DEFAULT_RESTART_WARNINGS.customOffsets] },
    updateWarnings: { ...DEFAULT_UPDATE_WARNINGS, customOffsets: [...DEFAULT_UPDATE_WARNINGS.customOffsets] },
    updatedAt,
  };
}
