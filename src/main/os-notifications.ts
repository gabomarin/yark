import { Notification, type BrowserWindow } from "electron";
import {
  OS_NOTIFY_CRASH_COOLDOWN_MS,
  formatCrashOsToastBody,
  formatSteamCmdOsToastBody,
  isYarkE2eUserDataEnv,
  shouldShowFleetOsNotification,
  shouldSkipNativeNotification,
  steamCmdOsToastSilent,
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
  /** Flap-crash cooldown timestamps by serverId. */
  private readonly lastCrashShownAtMs = new Map<string, number>();
  /** One OS toast per SteamCMD jobId for the session. */
  private readonly notifiedSteamCmdJobIds = new Set<string>();

  constructor(private readonly deps: FleetOsNotifierDeps) {}

  notifyCrash(payload: ServerCrashedNotifyPayload): boolean {
    const nowMs = this.now();
    if (
      !shouldShowFleetOsNotification({
        category: "crash",
        prefs: this.deps.readPrefs(),
        windowFocusedVisible: isBrowserWindowFocusedVisible(
          this.deps.getMainWindow(),
        ),
        nowMs,
        lastShownAtMs: this.lastCrashShownAtMs.get(payload.serverId),
        cooldownMs: OS_NOTIFY_CRASH_COOLDOWN_MS,
      })
    ) {
      return false;
    }
    const shown = showNativeOsNotification({
      title: "Server crashed",
      body: formatCrashOsToastBody(payload.serverName),
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
      this.lastCrashShownAtMs.set(payload.serverId, nowMs);
    }
    return shown;
  }

  notifySteamCmd(payload: SteamCmdJobTerminalPayload): boolean {
    const jobKey = payload.jobId ?? `anon:${payload.serverId ?? "fleet"}:${payload.eventId}`;
    const alreadyNotified = this.notifiedSteamCmdJobIds.has(jobKey);
    if (
      !shouldShowFleetOsNotification({
        category: "steamcmd",
        prefs: this.deps.readPrefs(),
        windowFocusedVisible: isBrowserWindowFocusedVisible(
          this.deps.getMainWindow(),
        ),
        operatorAwaited: payload.operatorAwaited,
        nowMs: this.now(),
        lastShownAtMs: undefined,
        cooldownMs: 0,
        alreadyNotifiedForJob: alreadyNotified,
      })
    ) {
      return false;
    }
    const shown = showNativeOsNotification({
      title: steamCmdToastTitle(payload),
      body: formatSteamCmdOsToastBody(payload.type, payload.serverName),
      silent: steamCmdOsToastSilent(payload.type),
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
      this.notifiedSteamCmdJobIds.add(jobKey);
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
