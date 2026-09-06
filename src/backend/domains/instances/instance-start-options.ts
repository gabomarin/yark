import type { StartServerOptions } from "@shared/types";
import { DEFAULT_OPEN_NATIVE_CONSOLE } from "@shared/open-native-console";

/** Optional InstanceService deps beyond repo/process/backup/lock. */
export interface InstanceServiceOptions {
  /**
   * Settings **Show server console on start**. Used when callers omit
   * `openNativeConsole` (maintenance restart, post-update start, …).
   */
  resolveOpenNativeConsole?: () => boolean;
  /**
   * Flush queued GUS/Game.ini drafts after stop / before start (#530).
   * Idempotent when nothing is pending.
   */
  flushPendingServerIni?: (serverId: string) => Promise<boolean>;
}

export function defaultResolveOpenNativeConsole(): boolean {
  return DEFAULT_OPEN_NATIVE_CONSOLE;
}

/**
 * Explicit IPC `openNativeConsole` wins; otherwise Settings
 * `openNativeConsoleOnStart` (maintenance / update resume omit the flag).
 */
export function withOpenNativeConsolePref(
  options: StartServerOptions | undefined,
  resolveOpenNativeConsole: () => boolean,
): StartServerOptions {
  return {
    ...options,
    openNativeConsole:
      options?.openNativeConsole ?? resolveOpenNativeConsole(),
  };
}
