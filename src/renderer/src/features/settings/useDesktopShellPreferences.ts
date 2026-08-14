import { useEffect, useState } from "react";
import {
  DEFAULT_CLOSE_WINDOW_TO_TRAY,
  DEFAULT_START_WITH_WINDOWS,
} from "@shared/desktop-shell";

export interface DesktopShellPreferencesController {
  closeWindowToTray: boolean;
  startWithWindows: boolean;
  trayCloseHintDismissed: boolean;
  desktopShellReady: boolean;
  onCloseWindowToTrayChange: (enabled: boolean) => void;
  onStartWithWindowsChange: (enabled: boolean) => void;
  onTrayCloseHintDismissedChange: (dismissed: boolean) => void;
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

  return {
    closeWindowToTray,
    startWithWindows,
    trayCloseHintDismissed,
    desktopShellReady,
    onCloseWindowToTrayChange,
    onStartWithWindowsChange,
    onTrayCloseHintDismissedChange,
    shellError,
    clearShellError: () => setShellError(null),
  };
}
