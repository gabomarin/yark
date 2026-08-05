import type { AppEvent, LogRetentionSettings, ServerUpdateLogStatus } from "./types";

/** SQLite `app_settings.key` for log retention policy JSON. */
export const LOG_RETENTION_SETTINGS_KEY = "logRetention.v1";

export const DEFAULT_LOG_RETENTION_SETTINGS: LogRetentionSettings = {
  eventsRetainDays: 90,
  eventsFailureRetainDays: 180,
  updateLogsRetainCount: 20,
  updateLogsFailureRetainDays: 180,
  autoCleanupEnabled: true,
};

const MIN_DAYS = 7;
const MAX_DAYS = 3650;
const MIN_COUNT = 1;
const MAX_COUNT = 200;

/** Event types treated as failure evidence even when severity is info. */
const FAILURE_EVENT_TYPES = new Set<AppEvent["type"]>([
  "server_crashed",
  "update_failed",
  "update_rolled_back",
  "auto_start_failed",
  "install_move_failed",
  "install_move_cleanup_failed",
  "installation_health_degraded",
  "error",
  "logs_retention_failed",
]);

export function isFailureEvent(event: Pick<AppEvent, "type" | "severity">): boolean {
  if (event.severity === "warning" || event.severity === "error") {
    return true;
  }
  return FAILURE_EVENT_TYPES.has(event.type);
}

export function isFailureUpdateLogStatus(status: ServerUpdateLogStatus): boolean {
  return status === "failed" || status === "unknown";
}

function clampDays(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.floor(value)));
}

function clampCount(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.floor(value)));
}

/**
 * Coerce and clamp retention settings. Ensures failure retain days are at least
 * as long as routine event retain days.
 */
export function normalizeLogRetentionSettings(
  settings: LogRetentionSettings,
): LogRetentionSettings {
  const eventsRetainDays = clampDays(
    settings.eventsRetainDays,
    DEFAULT_LOG_RETENTION_SETTINGS.eventsRetainDays,
  );
  const eventsFailureRetainDays = Math.max(
    eventsRetainDays,
    clampDays(
      settings.eventsFailureRetainDays,
      DEFAULT_LOG_RETENTION_SETTINGS.eventsFailureRetainDays,
    ),
  );
  return {
    eventsRetainDays,
    eventsFailureRetainDays,
    updateLogsRetainCount: clampCount(
      settings.updateLogsRetainCount,
      DEFAULT_LOG_RETENTION_SETTINGS.updateLogsRetainCount,
    ),
    updateLogsFailureRetainDays: clampDays(
      settings.updateLogsFailureRetainDays,
      DEFAULT_LOG_RETENTION_SETTINGS.updateLogsFailureRetainDays,
    ),
    autoCleanupEnabled: settings.autoCleanupEnabled === true,
  };
}

/** Validate operator input; throw so the previous policy is preserved. */
export function assertLogRetentionSettings(settings: LogRetentionSettings): void {
  const fields: Array<[string, number]> = [
    ["eventsRetainDays", settings.eventsRetainDays],
    ["eventsFailureRetainDays", settings.eventsFailureRetainDays],
    ["updateLogsFailureRetainDays", settings.updateLogsFailureRetainDays],
  ];
  for (const [label, value] of fields) {
    if (!Number.isFinite(value) || value < MIN_DAYS || value > MAX_DAYS) {
      throw new Error(`${label} must be between ${MIN_DAYS} and ${MAX_DAYS}`);
    }
  }
  if (
    !Number.isFinite(settings.updateLogsRetainCount)
    || settings.updateLogsRetainCount < MIN_COUNT
    || settings.updateLogsRetainCount > MAX_COUNT
  ) {
    throw new Error(`updateLogsRetainCount must be between ${MIN_COUNT} and ${MAX_COUNT}`);
  }
  if (typeof settings.autoCleanupEnabled !== "boolean") {
    throw new Error("autoCleanupEnabled must be a boolean");
  }
  if (settings.eventsFailureRetainDays < settings.eventsRetainDays) {
    throw new Error("eventsFailureRetainDays must be >= eventsRetainDays");
  }
}

export function parseLogRetentionSettings(raw: string | null): LogRetentionSettings {
  if (raw === null || raw.trim().length === 0) {
    return { ...DEFAULT_LOG_RETENTION_SETTINGS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LogRetentionSettings>;
    return normalizeLogRetentionSettings({
      eventsRetainDays:
        typeof parsed.eventsRetainDays === "number"
          ? parsed.eventsRetainDays
          : DEFAULT_LOG_RETENTION_SETTINGS.eventsRetainDays,
      eventsFailureRetainDays:
        typeof parsed.eventsFailureRetainDays === "number"
          ? parsed.eventsFailureRetainDays
          : DEFAULT_LOG_RETENTION_SETTINGS.eventsFailureRetainDays,
      updateLogsRetainCount:
        typeof parsed.updateLogsRetainCount === "number"
          ? parsed.updateLogsRetainCount
          : DEFAULT_LOG_RETENTION_SETTINGS.updateLogsRetainCount,
      updateLogsFailureRetainDays:
        typeof parsed.updateLogsFailureRetainDays === "number"
          ? parsed.updateLogsFailureRetainDays
          : DEFAULT_LOG_RETENTION_SETTINGS.updateLogsFailureRetainDays,
      autoCleanupEnabled:
        typeof parsed.autoCleanupEnabled === "boolean"
          ? parsed.autoCleanupEnabled
          : DEFAULT_LOG_RETENTION_SETTINGS.autoCleanupEnabled,
    });
  } catch {
    return { ...DEFAULT_LOG_RETENTION_SETTINGS };
  }
}

export function daysToCutoffIso(days: number, nowMs = Date.now()): string {
  return new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
}
