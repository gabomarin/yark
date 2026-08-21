import { useEffect, useState } from "react";
import {
  DEFAULT_CLOSE_WINDOW_TO_TRAY,
  DEFAULT_OS_NOTIFY_CRASH,
  DEFAULT_OS_NOTIFY_ENABLED,
  DEFAULT_OS_NOTIFY_STEAMCMD,
  DEFAULT_START_WITH_WINDOWS,
} from "@shared/desktop-shell";

export interface DesktopShellPreferencesController {
  closeWindowToTray: boolean;
  startWithWindows: boolean;
  trayCloseHintDismissed: boolean;
  osNotifyEnabled: boolean;
  osNotifyCrash: boolean;
  osNotifySteamCmd: boolean;
  desktopShellReady: boolean;
  onCloseWindowToTrayChange: (enabled: boolean) => void;
  onStartWithWindowsChange: (enabled: boolean) => void;
  onTrayCloseHintDismissedChange: (dismissed: boolean) => void;
  onOsNotifyEnabledChange: (enabled: boolean) => void;
  onOsNotifyCrashChange: (enabled: boolean) => void;
  onOsNotifySteamCmdChange: (enabled: boolean) => void;
  shellError: string | null;
  clearShellError: () => void;
}

export function useDesktopShellPreferences(): DesktopShellPreferencesController {
  const [closeWindowToTray, setCloseWindowToTray] = useState(
    DEFAULT_CLOSE_WINDOW_TO_TRAY,
  );
  const [startWithWindows, setStartWithWindows] = useState(
    DEFAULT_START_WITH_WINDOWS,
  );
  const [trayCloseHintDismissed, setTrayCloseHintDismissed] = useState(false);
  const [osNotifyEnabled, setOsNotifyEnabled] = useState(DEFAULT_OS_NOTIFY_ENABLED);
  const [osNotifyCrash, setOsNotifyCrash] = useState(DEFAULT_OS_NOTIFY_CRASH);
  const [osNotifySteamCmd, setOsNotifySteamCmd] = useState(DEFAULT_OS_NOTIFY_STEAMCMD);
  const [desktopShellReady, setDesktopShellReady] = useState(false);
  const [shellError, setShellError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (typeof window.api.getDesktopShellPreferences !== "function") {
        setDesktopShellReady(false);
        return;
      }
      const result = await window.api.getDesktopShellPreferences();
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setDesktopShellReady(false);
        return;
      }
      setCloseWindowToTray(result.data.closeWindowToTray);
      setStartWithWindows(result.data.startWithWindows);
      setTrayCloseHintDismissed(result.data.trayCloseHintDismissed);
      setOsNotifyEnabled(result.data.osNotifyEnabled);
      setOsNotifyCrash(result.data.osNotifyCrash);
      setOsNotifySteamCmd(result.data.osNotifySteamCmd);
      setDesktopShellReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onCloseWindowToTrayChange = (enabled: boolean): void => {
    const previous = closeWindowToTray;
    setCloseWindowToTray(enabled);
    void (async () => {
      const result = await window.api.setCloseWindowToTray(enabled);
      if (!result.ok) {
        setCloseWindowToTray(previous);
        setShellError(result.error ?? "Could not update close-to-tray setting");
      }
    })();
  };

  const onStartWithWindowsChange = (enabled: boolean): void => {
    const previous = startWithWindows;
    setStartWithWindows(enabled);
    void (async () => {
      const result = await window.api.setStartWithWindows(enabled);
      if (!result.ok) {
        setStartWithWindows(previous);
        setShellError(result.error ?? "Could not update start-with-Windows setting");
      }
    })();
  };

  const onTrayCloseHintDismissedChange = (dismissed: boolean): void => {
    const previous = trayCloseHintDismissed;
    setTrayCloseHintDismissed(dismissed);
    void (async () => {
      const result = await window.api.setTrayCloseHintDismissed(dismissed);
      if (!result.ok) {
        setTrayCloseHintDismissed(previous);
        setShellError(
          result.error ?? "Could not update tray notification preference",
        );
      }
    })();
  };

  const onOsNotifyEnabledChange = (enabled: boolean): void => {
    const previous = osNotifyEnabled;
    setOsNotifyEnabled(enabled);
    void (async () => {
      const result = await window.api.setOsNotifyEnabled(enabled);
      if (!result.ok) {
        setOsNotifyEnabled(previous);
        setShellError(result.error ?? "Could not update Windows notifications");
      }
    })();
  };

  const onOsNotifyCrashChange = (enabled: boolean): void => {
    const previous = osNotifyCrash;
    setOsNotifyCrash(enabled);
    void (async () => {
      const result = await window.api.setOsNotifyCrash(enabled);
      if (!result.ok) {
        setOsNotifyCrash(previous);
        setShellError(result.error ?? "Could not update crash notifications");
      }
    })();
  };

  const onOsNotifySteamCmdChange = (enabled: boolean): void => {
    const previous = osNotifySteamCmd;
    setOsNotifySteamCmd(enabled);
    void (async () => {
      const result = await window.api.setOsNotifySteamCmd(enabled);
      if (!result.ok) {
        setOsNotifySteamCmd(previous);
        setShellError(result.error ?? "Could not update SteamCMD notifications");
      }
    })();
  };

  return {
    closeWindowToTray,
    startWithWindows,
    trayCloseHintDismissed,
    osNotifyEnabled,
    osNotifyCrash,
    osNotifySteamCmd,
    desktopShellReady,
    onCloseWindowToTrayChange,
    onStartWithWindowsChange,
    onTrayCloseHintDismissedChange,
    onOsNotifyEnabledChange,
    onOsNotifyCrashChange,
    onOsNotifySteamCmdChange,
    shellError,
    clearShellError: () => setShellError(null),
  };
}
