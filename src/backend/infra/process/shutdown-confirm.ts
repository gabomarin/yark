/**
 * Lost Colony's ShooterGame.log does not print `Saving world` / `World Save Complete`.
 * A clean DoExit ends with `Closing by request` and, once the process has finished, `Log file closed`.
 * A stop that dies in between leaves `Closing by request` as the last line.
 */

const CLOSING_BY_REQUEST = /closing by request/i;
const LOG_FILE_CLOSED = /log file closed/i;

/** How often Stop re-reads ShooterGame.log after DoExit. */
const SHUTDOWN_POLL_MS = 500;

/**
 * How long Stop waits for the process to finish after DoExit before force-kill.
 * A clean Lost Colony close has been observed at about 25s. The previous 30s
 * cap killed sessions that were still on `Closing by request`.
 */
export const SHUTDOWN_EXIT_TIMEOUT_MS = 10 * 60 * 1000;

export interface ShutdownLogState {
  /** DoExit was accepted. This is not proof the world file was written. */
  closingRequested: boolean;
  /** Process finished closing the log. Present only on a clean exit. */
  logFileClosed: boolean;
}

export function assessShutdownLog(text: string): ShutdownLogState {
  let closingRequested = false;
  let logFileClosed = false;
  for (const line of text.split(/\r?\n/)) {
    if (CLOSING_BY_REQUEST.test(line)) closingRequested = true;
    if (LOG_FILE_CLOSED.test(line)) logFileClosed = true;
  }
  return { closingRequested, logFileClosed };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ShutdownWaitClock {
  readLog: () => string;
  hasExited: () => boolean;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  timeoutMs?: number;
  pollMs?: number;
}

export type ShutdownWaitResult = "exited" | "log-closed" | "timeout";

/**
 * After DoExit, wait until the process leaves or ShooterGame.log prints
 * `Log file closed`. `Closing by request` alone keeps the wait open.
 */
export async function waitForCleanShutdown(input: ShutdownWaitClock): Promise<ShutdownWaitResult> {
  const timeoutMs = input.timeoutMs ?? SHUTDOWN_EXIT_TIMEOUT_MS;
  const pollMs = input.pollMs ?? SHUTDOWN_POLL_MS;
  const deadline = input.now() + timeoutMs;
  for (;;) {
    const closed = assessShutdownLog(input.readLog()).logFileClosed;
    if (closed) return "log-closed";
    if (input.hasExited()) return "exited";
    if (input.now() >= deadline) return "timeout";
    await input.sleep(pollMs);
  }
}
