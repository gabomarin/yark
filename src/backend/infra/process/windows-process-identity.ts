import type { LiveProcessIdentity } from "@shared/left-running";
import { execFileBounded } from "./exec-file-bounded";

interface WmiProcessRow {
  ProcessId?: number;
  ExecutablePath?: string | null;
  CommandLine?: string | null;
  CreationDate?: string | null;
}

const QUERY_TIMEOUT_MS = 5_000;

/**
 * Best-effort Windows process identity for crash-recovery reattach validation.
 * Returns null when the PID is gone or the query fails.
 *
 * Only a validated integer PID is interpolated into PowerShell — never paths or
 * free-form strings — so quoting/escaping issues from install dirs cannot break
 * the filter.
 *
 * Uses async exec so the Electron main process is not blocked (#145).
 */
export async function queryWindowsProcessIdentity(
  pid: number,
): Promise<LiveProcessIdentity | null> {
  if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  const safePid = pid;

  try {
    // Build the script with only the numeric PID embedded (no path interpolation).
    const script = [
      `$ProcessId = ${safePid}`,
      `$p = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $ProcessId) -ErrorAction SilentlyContinue`,
      `if ($null -eq $p) { '' } else { $p | Select-Object ProcessId,ExecutablePath,CommandLine,CreationDate | ConvertTo-Json -Compress }`,
    ].join("; ");

    const { stdout } = await execFileBounded(
      "powershell.exe",
      ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", script],
      {
        timeoutMs: QUERY_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );
    const raw = stdout.trim();
    if (raw.length === 0) {
      return null;
    }
    const parsed = JSON.parse(raw) as WmiProcessRow;
    if (typeof parsed.ProcessId !== "number" || parsed.ProcessId !== safePid) {
      return null;
    }
    return {
      pid: safePid,
      executablePath:
        typeof parsed.ExecutablePath === "string" && parsed.ExecutablePath.trim() !== ""
          ? parsed.ExecutablePath
          : null,
      commandLine:
        typeof parsed.CommandLine === "string" && parsed.CommandLine.trim() !== ""
          ? parsed.CommandLine
          : null,
      osCreationTime:
        typeof parsed.CreationDate === "string" && parsed.CreationDate.trim() !== ""
          ? parsed.CreationDate
          : null,
    };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      `[yark] queryWindowsProcessIdentity failed for pid ${safePid}: ${detail}`,
    );
    return null;
  }
}
