import type { AppSettingsRepository } from "../backend/infra/db/app-settings-repository";
import {
  CLOSE_WINDOW_TO_TRAY_SETTING_KEY,
  DEFAULT_CLOSE_WINDOW_TO_TRAY,
  DEFAULT_OS_NOTIFY_CRASH,
  DEFAULT_OS_NOTIFY_ENABLED,
  DEFAULT_OS_NOTIFY_STEAMCMD,
  DEFAULT_OS_NOTIFY_YARK_UPDATE,
  DEFAULT_START_WITH_WINDOWS,
  OS_NOTIFY_CRASH_SETTING_KEY,
  OS_NOTIFY_ENABLED_SETTING_KEY,
  OS_NOTIFY_STEAMCMD_SETTING_KEY,
  OS_NOTIFY_YARK_UPDATE_SETTING_KEY,
  START_WITH_WINDOWS_SETTING_KEY,
  TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY,
  parseStoredBoolean,
  serializeStoredBoolean,
  type DesktopShellPreferences,
} from "../shared/desktop-shell";

export function readDesktopShellPreferences(
  settings: AppSettingsRepository,
): DesktopShellPreferences {
  return {
    closeWindowToTray: parseStoredBoolean(
      settings.get(CLOSE_WINDOW_TO_TRAY_SETTING_KEY),
      DEFAULT_CLOSE_WINDOW_TO_TRAY,
    ),
    startWithWindows: parseStoredBoolean(
      settings.get(START_WITH_WINDOWS_SETTING_KEY),
      DEFAULT_START_WITH_WINDOWS,
    ),
    trayCloseHintDismissed: parseStoredBoolean(
      settings.get(TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY),
      false,
    ),
    osNotifyEnabled: parseStoredBoolean(
      settings.get(OS_NOTIFY_ENABLED_SETTING_KEY),
      DEFAULT_OS_NOTIFY_ENABLED,
    ),
    osNotifyCrash: parseStoredBoolean(
      settings.get(OS_NOTIFY_CRASH_SETTING_KEY),
      DEFAULT_OS_NOTIFY_CRASH,
    ),
    osNotifySteamCmd: parseStoredBoolean(
      settings.get(OS_NOTIFY_STEAMCMD_SETTING_KEY),
      DEFAULT_OS_NOTIFY_STEAMCMD,
    ),
    osNotifyYarkUpdate: parseStoredBoolean(
      settings.get(OS_NOTIFY_YARK_UPDATE_SETTING_KEY),
      DEFAULT_OS_NOTIFY_YARK_UPDATE,
    ),
  };
}

export function setCloseWindowToTray(
  settings: AppSettingsRepository,
  enabled: boolean,
): boolean {
  settings.set(CLOSE_WINDOW_TO_TRAY_SETTING_KEY, serializeStoredBoolean(enabled));
  return enabled;
}

export function setStartWithWindowsPreference(
  settings: AppSettingsRepository,
  enabled: boolean,
): boolean {
  settings.set(START_WITH_WINDOWS_SETTING_KEY, serializeStoredBoolean(enabled));
  return enabled;
}

export function setTrayCloseHintDismissed(
  settings: AppSettingsRepository,
  dismissed: boolean,
): boolean {
  settings.set(
    TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY,
    serializeStoredBoolean(dismissed),
  );
  return dismissed;
}

export function setOsNotifyEnabled(
  settings: AppSettingsRepository,
  enabled: boolean,
): boolean {
  settings.set(OS_NOTIFY_ENABLED_SETTING_KEY, serializeStoredBoolean(enabled));
  return enabled;
}

export function setOsNotifyCrash(
  settings: AppSettingsRepository,
  enabled: boolean,
): boolean {
  settings.set(OS_NOTIFY_CRASH_SETTING_KEY, serializeStoredBoolean(enabled));
  return enabled;
}

export function setOsNotifySteamCmd(
  settings: AppSettingsRepository,
  enabled: boolean,
): boolean {
  settings.set(OS_NOTIFY_STEAMCMD_SETTING_KEY, serializeStoredBoolean(enabled));
  return enabled;
}

export function setOsNotifyYarkUpdate(
  settings: AppSettingsRepository,
  enabled: boolean,
): boolean {
  settings.set(OS_NOTIFY_YARK_UPDATE_SETTING_KEY, serializeStoredBoolean(enabled));
  return enabled;
}
