import { execFileSync } from "node:child_process";
import type { LiveProcessIdentity } from "@shared/left-running";

interface WmiProcessRow {
  ProcessId?: number;
  ExecutablePath?: string | null;
  CommandLine?: string | null;
  CreationDate?: string | null;
}

/**
 * Best-effort Windows process identity for Leave / reattach validation.
 * Returns null when the PID is gone or the query fails.
 */
export function queryWindowsProcessIdentity(pid: number): LiveProcessIdentity | null {
  if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  try {
    const raw = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue;` +
          `if(-not $p){''}else{$p|Select-Object ProcessId,ExecutablePath,CommandLine,CreationDate|ConvertTo-Json -Compress}`,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3_000,
        windowsHide: true,
      },
    ).trim();
    if (raw.length === 0) {
      return null;
    }
    const parsed = JSON.parse(raw) as WmiProcessRow;
    if (typeof parsed.ProcessId !== "number" || parsed.ProcessId !== pid) {
      return null;
    }
    return {
      pid,
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
  } catch {
    return null;
  }
}
