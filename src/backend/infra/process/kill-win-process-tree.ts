import type { ChildProcess } from "node:child_process";
import { execFileBounded } from "./exec-file-bounded";

const TASKKILL_TIMEOUT_MS = 5_000;

/**
 * Kill a Windows process tree without blocking the Electron main thread (#145).
 * Returns true when taskkill reported success.
 */
export async function killWinProcessTreeAsync(pid: number): Promise<boolean> {
  if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    await execFileBounded(
      "taskkill.exe",
      ["/PID", String(pid), "/T", "/F"],
      {
        timeoutMs: TASKKILL_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** Best-effort tree kill, then fall back to `child.kill()`. */
export async function killChildProcessTreeAsync(
  child: ChildProcess | null | undefined,
): Promise<void> {
  if (child == null) return;
  const pid = child.pid;
  if (pid !== undefined && (await killWinProcessTreeAsync(pid))) {
    return;
  }
  try {
    child.kill();
  } catch {
    // already exited
  }
}
