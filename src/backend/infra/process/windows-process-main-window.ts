import { execFileBounded } from "./exec-file-bounded";

const QUERY_TIMEOUT_MS = 4_000;

/**
 * True when the process has a non-zero main window handle (console or GUI).
 * Used to end the “Loading Ark Server API…” Overview phase once the server
 * window appears (#243).
 */
export async function windowsProcessHasMainWindow(pid: number): Promise<boolean> {
  if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  const safePid = pid;
  try {
    const script = [
      `$p = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue`,
      `if ($null -eq $p) { '0' } elseif ([int64]$p.MainWindowHandle -ne 0) { '1' } else { '0' }`,
    ].join("; ");
    const { stdout } = await execFileBounded(
      "powershell.exe",
      ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", script],
      {
        timeoutMs: QUERY_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    return stdout.trim() === "1";
  } catch {
    return false;
  }
}
