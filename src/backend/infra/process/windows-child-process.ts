import { execFileBounded } from "../../infra/process/exec-file-bounded";

const QUERY_TIMEOUT_MS = 5_000;

interface WmiChildRow {
  ProcessId?: number;
  Name?: string | null;
}

/**
 * Find a direct child of `parentPid` whose image name matches `imageName`
 * (e.g. ArkAscendedServer.exe). Windows only; null elsewhere or on miss.
 */
export async function findWindowsChildProcessByName(
  parentPid: number,
  imageName: string,
): Promise<number | null> {
  if (process.platform !== "win32" || !Number.isInteger(parentPid) || parentPid <= 0) {
    return null;
  }
  const safeName = imageName.replace(/[^A-Za-z0-9._-]/g, "");
  if (safeName.length === 0 || safeName !== imageName) {
    return null;
  }
  const safeParent = parentPid;
  try {
    const script = [
      `$ParentProcessId = ${safeParent}`,
      `$Name = '${safeName}'`,
      `$rows = Get-CimInstance -ClassName Win32_Process -Filter ('ParentProcessId=' + $ParentProcessId) -ErrorAction SilentlyContinue |`,
      `  Where-Object { $_.Name -ieq $Name }`,
      `if ($null -eq $rows) { '' } else { @($rows)[0] | Select-Object ProcessId,Name | ConvertTo-Json -Compress }`,
    ].join("; ");

    const { stdout } = await execFileBounded(
      "powershell.exe",
      ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", script],
      {
        timeoutMs: QUERY_TIMEOUT_MS,
        maxBuffer: 256 * 1024,
        windowsHide: true,
      },
    );
    const raw = stdout.trim();
    if (raw.length === 0) return null;
    const parsed = JSON.parse(raw) as WmiChildRow;
    if (typeof parsed.ProcessId !== "number" || parsed.ProcessId <= 0) {
      return null;
    }
    return parsed.ProcessId;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      `[yark] findWindowsChildProcessByName failed for parent ${safeParent}: ${detail}`,
    );
    return null;
  }
}
