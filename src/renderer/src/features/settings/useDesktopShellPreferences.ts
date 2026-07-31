import { useEffect, useState } from "react";
import {
  DEFAULT_CLOSE_WINDOW_TO_TRAY,
  DEFAULT_START_WITH_WINDOWS,
} from "@shared/desktop-shell";

export function useDesktopShellPreferences(): {
  closeWindowToTray: boolean;
  startWithWindows: boolean;
  desktopShellReady: boolean;
  onCloseWindowToTrayChange: (enabled: boolean) => void;
  onStartWithWindowsChange: (enabled: boolean) => void;
  shellError: string | null;
  clearShellError: () => void;
} {
  const [closeWindowToTray, setCloseWindowToTray] = useState(
    DEFAULT_CLOSE_WINDOW_TO_TRAY,
  );
  const [startWithWindows, setStartWithWindows] = useState(
    DEFAULT_START_WITH_WINDOWS,
  );
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

  return {
    closeWindowToTray,
    startWithWindows,
    desktopShellReady,
    onCloseWindowToTrayChange,
    onStartWithWindowsChange,
    shellError,
    clearShellError: () => setShellError(null),
  };
}
