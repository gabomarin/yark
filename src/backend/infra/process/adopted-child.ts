import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

const ADOPT_POLL_MS = 2000;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synthetic ChildProcess for an OS PID we did not spawn (crash-recovery reattach).
 * Polls liveness and emits `exit` when the process disappears.
 *
 * The poll `setInterval` stays referenced on purpose while YARK tracks the
 * server (do not unref): an unref'd timer could be GC'd and miss process death.
 * {@link markExited} clears the interval when the PID disappears or kill succeeds.
 */
export function createAdoptedChildHandle(pid: number): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  let exitCode: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const markExited = (code: number): void => {
    if (exitCode !== null) {
      return;
    }
    exitCode = code;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    child.emit("exit", code, null);
  };

  Object.defineProperty(child, "pid", {
    get: () => pid,
    enumerable: true,
  });
  Object.defineProperty(child, "exitCode", {
    get: () => exitCode,
    enumerable: true,
  });
  Object.assign(child, {
    stdout: null,
    stderr: null,
    stdin: null,
    killed: false,
    connected: false,
    kill: (): boolean => {
      if (exitCode !== null) {
        return true;
      }
      if (!pidAlive(pid)) {
        markExited(0);
        return true;
      }
      // Prefer ProcessManager taskkill on win32; signal may not work for ASA.
      try {
        process.kill(pid);
        return true;
      } catch {
        return false;
      }
    },
    unref: (): ChildProcess => child,
    ref: (): ChildProcess => child,
    disconnect: (): void => undefined,
  });

  timer = setInterval(() => {
    if (!pidAlive(pid)) {
      // Unexpected disappearance (not a tracked graceful stop signal).
      markExited(1);
    }
  }, ADOPT_POLL_MS);
  // Intentionally referenced — see createAdoptedChildHandle docs.

  if (!pidAlive(pid)) {
    // Defer so callers can attach `exit` listeners first.
    setImmediate(() => markExited(1));
  }

  return child;
}
