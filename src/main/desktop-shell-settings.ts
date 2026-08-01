import type { AppSettingsRepository } from "../backend/infra/db/app-settings-repository";
import {
  CLOSE_WINDOW_TO_TRAY_SETTING_KEY,
  DEFAULT_CLOSE_WINDOW_TO_TRAY,
  DEFAULT_ON_QUIT_WITH_ACTIVE_SERVERS,
  DEFAULT_START_WITH_WINDOWS,
  ON_QUIT_WITH_ACTIVE_SERVERS_SETTING_KEY,
  START_WITH_WINDOWS_SETTING_KEY,
  TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY,
  parseOnQuitWithActiveServers,
  parseStoredBoolean,
  serializeStoredBoolean,
  type DesktopShellPreferences,
  type OnQuitWithActiveServers,
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
    onQuitWithActiveServers: parseOnQuitWithActiveServers(
      settings.get(ON_QUIT_WITH_ACTIVE_SERVERS_SETTING_KEY),
      DEFAULT_ON_QUIT_WITH_ACTIVE_SERVERS,
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

export function setOnQuitWithActiveServers(
  settings: AppSettingsRepository,
  policy: OnQuitWithActiveServers,
): OnQuitWithActiveServers {
  settings.set(ON_QUIT_WITH_ACTIVE_SERVERS_SETTING_KEY, policy);
  return policy;
}
