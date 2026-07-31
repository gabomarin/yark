import type { AppSettingsRepository } from "../db/app-settings-repository";
import {
  LEFT_RUNNING_PROCESSES_SETTING_KEY,
  parseLeftRunningProcesses,
  type LeftRunningProcessIdentity,
} from "@shared/left-running";

export function readLeftRunningProcesses(
  settings: AppSettingsRepository,
): LeftRunningProcessIdentity[] {
  return parseLeftRunningProcesses(settings.get(LEFT_RUNNING_PROCESSES_SETTING_KEY));
}

export function writeLeftRunningProcesses(
  settings: AppSettingsRepository,
  records: LeftRunningProcessIdentity[],
): void {
  if (records.length === 0) {
    settings.set(LEFT_RUNNING_PROCESSES_SETTING_KEY, null);
    return;
  }
  settings.set(LEFT_RUNNING_PROCESSES_SETTING_KEY, JSON.stringify(records));
}

export function upsertLeftRunningProcess(
  settings: AppSettingsRepository,
  record: LeftRunningProcessIdentity,
): void {
  const next = readLeftRunningProcesses(settings).filter(
    (existing) => existing.serverId !== record.serverId,
  );
  next.push(record);
  writeLeftRunningProcesses(settings, next);
}

export function removeLeftRunningProcess(
  settings: AppSettingsRepository,
  serverId: string,
): void {
  const next = readLeftRunningProcesses(settings).filter(
    (existing) => existing.serverId !== serverId,
  );
  writeLeftRunningProcesses(settings, next);
}

export function clearLeftRunningProcesses(settings: AppSettingsRepository): void {
  settings.set(LEFT_RUNNING_PROCESSES_SETTING_KEY, null);
}
