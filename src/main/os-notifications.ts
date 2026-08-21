import { Notification, type BrowserWindow } from "electron";
import {
  OS_NOTIFY_CRASH_COOLDOWN_MS,
  OS_NOTIFY_STEAMCMD_JOB_COOLDOWN_MS,
  isYarkE2eUserDataEnv,
  shouldShowFleetOsNotification,
  shouldSkipNativeNotification,
  truncateToastBody,
  type ServerCrashedNotifyPayload,
  type SteamCmdJobTerminalPayload,
} from "../shared/os-notification-events";
import type { DesktopShellPreferences } from "../shared/desktop-shell";
import { IPC_PUSH, type OsNotificationOpenPush } from "../shared/ipc";

function isBrowserWindowFocusedVisible(
  win: BrowserWindow | null,
): boolean {
  if (win === null || win.isDestroyed()) {
    return false;
  }
  if (!win.isVisible() || win.isMinimized()) {
    return false;
  }
  return win.isFocused();
}

export function showNativeOsNotification(options: {
  title: string;
  body: string;
  silent: boolean;
  onClick: () => void;
}): boolean {
  if (
    shouldSkipNativeNotification({
      isSupported: Notification.isSupported(),
      isE2e: isYarkE2eUserDataEnv(),
    })
  ) {
    return false;
  }
  const notification = new Notification({
    title: options.title,
    body: options.body,
    silent: options.silent,
  });
  notification.on("click", options.onClick);
  notification.show();
  return true;
}

interface FleetOsNotifierDeps {
  readPrefs: () => DesktopShellPreferences;
  getMainWindow: () => BrowserWindow | null;
  revealMainWindow: () => void;
  sendToRenderer: (channel: string, payload: unknown) => void;
  now?: () => number;
}

export class FleetOsNotifier {
  private readonly lastShownAtMs = new Map<string, number>();

  constructor(private readonly deps: FleetOsNotifierDeps) {}

  notifyCrash(payload: ServerCrashedNotifyPayload): boolean {
    const key = `crash:${payload.serverId}`;
    const nowMs = this.now();
    if (
      !shouldShowFleetOsNotification({
        category: "crash",
        prefs: this.deps.readPrefs(),
        windowFocusedVisible: isBrowserWindowFocusedVisible(
          this.deps.getMainWindow(),
        ),
        nowMs,
        lastShownAtMs: this.lastShownAtMs.get(key),
        cooldownMs: OS_NOTIFY_CRASH_COOLDOWN_MS,
      })
    ) {
      return false;
    }
    const shown = showNativeOsNotification({
      title: "Server crashed",
      body: truncateToastBody(
        payload.summary.length > 0
          ? payload.summary
          : `"${payload.serverName}" exited unexpectedly.`,
      ),
      silent: false,
      onClick: () => {
        this.deps.revealMainWindow();
        const open: OsNotificationOpenPush = {
          kind: "crash",
          serverId: payload.serverId,
          eventId: payload.eventId,
        };
        this.deps.sendToRenderer(IPC_PUSH.osNotificationOpen, open);
      },
    });
    if (shown) {
      this.lastShownAtMs.set(key, nowMs);
    }
    return shown;
  }

  notifySteamCmd(payload: SteamCmdJobTerminalPayload): boolean {
    const key = `steamcmd:${payload.jobId ?? payload.serverId ?? "fleet"}`;
    const nowMs = this.now();
    if (
      !shouldShowFleetOsNotification({
        category: "steamcmd",
        prefs: this.deps.readPrefs(),
        windowFocusedVisible: isBrowserWindowFocusedVisible(
          this.deps.getMainWindow(),
        ),
        nowMs,
        lastShownAtMs: this.lastShownAtMs.get(key),
        cooldownMs: OS_NOTIFY_STEAMCMD_JOB_COOLDOWN_MS,
      })
    ) {
      return false;
    }
    const shown = showNativeOsNotification({
      title: steamCmdToastTitle(payload),
      body: truncateToastBody(payload.message),
      silent: false,
      onClick: () => {
        this.deps.revealMainWindow();
        const open: OsNotificationOpenPush = {
          kind: "steamcmd",
          serverId: payload.serverId,
        };
        this.deps.sendToRenderer(IPC_PUSH.osNotificationOpen, open);
      },
    });
    if (shown) {
      this.lastShownAtMs.set(key, nowMs);
    }
    return shown;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

function steamCmdToastTitle(payload: SteamCmdJobTerminalPayload): string {
  if (payload.type === "update_completed") {
    return "SteamCMD finished";
  }
  if (payload.type === "update_rolled_back") {
    return "Update rolled back";
  }
  return "SteamCMD failed";
}
