/**
 * Pure helpers for app-quit coordination (#59).
 * Keeps window-close / double-quit decisions testable without Electron.
 */

export interface QuitGateFlags {
  allowQuit: boolean;
  isQuitting: boolean;
  hasPendingQuitWork: boolean;
  quitPolicyPromptInFlight: boolean;
}

/**
 * Whether BrowserWindow `close` should be prevented while quit is coordinating.
 * `allowQuit` always wins (final exit after stop/settle).
 */
export function shouldPreventCloseDuringQuit(flags: QuitGateFlags): boolean {
  if (flags.allowQuit) {
    return false;
  }
  return (
    flags.hasPendingQuitWork ||
    flags.quitPolicyPromptInFlight ||
    flags.isQuitting
  );
}

/** Reset transient quit flags after cancel or a failed stop-before-quit. */
export function quitFlagsAfterCancel(): Pick<
  QuitGateFlags,
  "allowQuit" | "isQuitting" | "hasPendingQuitWork" | "quitPolicyPromptInFlight"
> {
  return {
    allowQuit: false,
    isQuitting: false,
    hasPendingQuitWork: false,
    quitPolicyPromptInFlight: false,
  };
}

/** Flags while Ask dialog is open (window must stay alive). */
export function quitFlagsWhileAskPrompt(): Pick<
  QuitGateFlags,
  "isQuitting" | "quitPolicyPromptInFlight"
> {
  return {
    isQuitting: true,
    quitPolicyPromptInFlight: true,
  };
}

/** Flags while async stop/settle runs before exit. */
export function quitFlagsWhilePendingWork(): Pick<
  QuitGateFlags,
  "isQuitting" | "hasPendingQuitWork" | "quitPolicyPromptInFlight"
> {
  return {
    isQuitting: true,
    hasPendingQuitWork: true,
    quitPolicyPromptInFlight: false,
  };
}
