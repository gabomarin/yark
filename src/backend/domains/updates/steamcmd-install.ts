import { mkdir, access } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import { execFileBounded } from "../../infra/process/exec-file-bounded";
import {
  STEAMCMD_MISSING_MESSAGE,
  buildSteamCmdCandidatePaths,
  buildSteamCmdInstallPowerShell,
  isSteamCmdSearchIsolated,
  isSteamCmdVerifyExitAcceptable,
  normalizeSteamCmdExecutablePath,
  resolveSteamCmdExecutableCached,
  updateJobNeedsSteamCmdExecutable,
} from "./steamcmd-path";
import {
  STEAMCMD_ENGLISH_ARGS,
  steamCmdSpawnEnv,
  resolveSteamCmdHome,
} from "./steamcmd-content-cache";
import type { UpdateCriticalJob } from "./update-critical-jobs";

export interface SteamCmdInstallHost {
  readonly settings: AppSettingsRepository;
  readonly steamcmdDir: string;
  appendSteamCmdConsole(
    line: string,
    options?: { forceProgressPush?: boolean },
  ): void;
  captureSteamCmdOutput(chunk: string, source: string): void;
  beginSteamCmdProcess(
    child: ChildProcess,
    operation: "install-steamcmd" | "install-files" | "update" | "verify-files",
    serverId: string | null,
  ): void;
  endSteamCmdProcess(child: ChildProcess): void;
  resetContentCache(): void;
}

/**
 * SteamCMD install, discover, verify, and path persistence.
 * UpdateService keeps thin public facades and owns queue/cancel runtime.
 */
export class SteamCmdInstall {
  /** Last path confirmed by async discovery / persist — status polls must not `existsSync`. */
  private lastKnownSteamCmdPath: string | null = null;
  /** True after a launch probe found no steamcmd.exe — do not revive a stale settings path. */
  private steamCmdConfirmedMissing = false;

  constructor(private readonly host: SteamCmdInstallHost) {
    const configured = this.host.settings.get("steamcmdPath")?.trim();
    if (configured != null && configured.length > 0) {
      this.lastKnownSteamCmdPath = configured;
    }
  }

  /** Launch probe found no executable — block stale settings revival until rediscovery. */
  markConfirmedMissing(): void {
    this.lastKnownSteamCmdPath = null;
    this.steamCmdConfirmedMissing = true;
  }

async installSteamCmd(): Promise<string> {
  this.host.appendSteamCmdConsole("Starting SteamCMD verification/installation...");
  const existing = await this.findSteamCmdExecutable();
  if (existing !== null) {
    this.host.appendSteamCmdConsole(`SteamCMD detected at: ${existing}`);
    await this.verifySteamCmdExecutable(existing);
    this.persistSteamCmdPath(existing);
    this.host.appendSteamCmdConsole("SteamCMD validated successfully.");
    return existing;
  }

  await mkdir(this.host.steamcmdDir, { recursive: true });
  const exePath = join(this.host.steamcmdDir, "steamcmd.exe");
  const command = buildSteamCmdInstallPowerShell(this.host.steamcmdDir);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        windowsHide: true,
        shell: false,
      },
    );
    this.host.beginSteamCmdProcess(child, "install-steamcmd", null);

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      this.host.captureSteamCmdOutput(text, "install/stderr");
    });
    child.stdout.on("data", (chunk) => {
      this.host.captureSteamCmdOutput(String(chunk), "install/stdout");
    });

    child.once("error", (error) => {
      this.host.endSteamCmdProcess(child);
      reject(new Error(`Could not run PowerShell: ${error.message}`));
    });

    child.once("exit", (code) => {
      this.host.endSteamCmdProcess(child);
      if ((code ?? 1) !== 0) {
        reject(new Error(`SteamCMD installation failed (exit ${code ?? 1}): ${stderr}`));
        return;
      }
      resolve();
    });
  });

  if (!existsSync(exePath)) {
    throw new Error(`SteamCMD was not installed at ${exePath}`);
  }

  await this.verifySteamCmdExecutable(exePath);
  this.persistSteamCmdPath(exePath);
  this.host.appendSteamCmdConsole(`SteamCMD installed and validated at: ${exePath}`);
  return exePath;
}

async setSteamCmdExecutablePath(exePath: string): Promise<string> {
  const normalized = normalizeSteamCmdExecutablePath(exePath);
  if (!existsSync(normalized)) {
    throw new Error(`steamcmd.exe not found at: ${normalized}`);
  }
  await this.verifySteamCmdExecutable(normalized);
  this.persistSteamCmdPath(normalized);
  this.host.resetContentCache();
  this.host.appendSteamCmdConsole(`Manual SteamCMD path configured: ${normalized}`);
  return normalized;
}

async resolveSteamCmdExecutable(): Promise<string> {
  const discovered = await this.findSteamCmdExecutable();
  if (discovered !== null) {
    this.persistSteamCmdPath(discovered);
    return discovered;
  }

  return "steamcmd.exe";
}

steamCmdMissingError(): Error {
  return new Error(STEAMCMD_MISSING_MESSAGE);
}

async ensureSteamCmdReadyForOperator(job?: UpdateCriticalJob): Promise<void> {
  if (job !== undefined && !updateJobNeedsSteamCmdExecutable(job)) {
    return;
  }
  if (this.steamCmdConfirmedMissing) {
    const exe = await this.findSteamCmdExecutable();
    if (exe !== null) {
      this.persistSteamCmdPath(exe);
      return;
    }
    throw this.steamCmdMissingError();
  }
  if (this.findSteamCmdExecutableCached() === null) {
    throw this.steamCmdMissingError();
  }
}

findSteamCmdExecutableCached(): string | null {
  const configured = this.host.settings.get("steamcmdPath");
  const resolved = resolveSteamCmdExecutableCached({
    confirmedMissing: this.steamCmdConfirmedMissing,
    lastKnownPath: this.lastKnownSteamCmdPath,
    configured,
    envPath: process.env["STEAMCMD_PATH"],
  });
  if (
    resolved !== null
    && configured != null
    && configured.trim() === resolved
    && (
      this.lastKnownSteamCmdPath == null
      || this.lastKnownSteamCmdPath.trim().length === 0
    )
  ) {
    this.lastKnownSteamCmdPath = resolved;
  }
  return resolved;
}

steamCmdCandidatePaths(): string[] {
  return buildSteamCmdCandidatePaths({
    configured: this.host.settings.get("steamcmdPath"),
    envPath: process.env["STEAMCMD_PATH"],
    steamcmdDir: this.host.steamcmdDir,
    isolated: isSteamCmdSearchIsolated(process.env["YARK_E2E_USER_DATA"]),
    programFilesX86: process.env["ProgramFiles(x86)"],
    programFiles: process.env["ProgramFiles"],
    localAppData: process.env["LOCALAPPDATA"],
  });
}

async findSteamCmdExecutable(): Promise<string | null> {
  for (const candidate of this.steamCmdCandidatePaths()) {
    try {
      await access(candidate);
      this.lastKnownSteamCmdPath = candidate;
      return candidate;
    } catch {
      // try next candidate
    }
  }

  if (isSteamCmdSearchIsolated(process.env["YARK_E2E_USER_DATA"])) {
    return null;
  }

  try {
    const { stdout } = await execFileBounded(
      "where.exe",
      ["steamcmd.exe"],
      {
        timeoutMs: 2_000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      try {
        await access(line);
        this.lastKnownSteamCmdPath = line;
        return line;
      } catch {
        // try next PATH hit
      }
    }
  } catch {
    // Best effort: if where.exe does not find steamcmd, continue without a detected path.
  }

  return null;
}

persistSteamCmdPath(exePath: string): void {
  this.steamCmdConfirmedMissing = false;
  this.lastKnownSteamCmdPath = exePath;
  this.host.settings.set("steamcmdPath", exePath);
  process.env["STEAMCMD_PATH"] = exePath;
  process.env["ARK_STEAMCMD_DIR"] = dirname(exePath);
}

async verifySteamCmdExecutable(exePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    this.host.appendSteamCmdConsole(`Validating SteamCMD: ${exePath}`);
    const child = spawn(exePath, [...STEAMCMD_ENGLISH_ARGS, "+quit"], {
      cwd: resolveSteamCmdHome(exePath),
      windowsHide: true,
      shell: false,
      env: steamCmdSpawnEnv(),
    });

    let finished = false;
    let sawOutput = false;
    let stderr = "";
    const timer = setTimeout(() => {
      if (finished) {
        return;
      }
      finished = true;
      child.kill();
      resolve();
    }, 20_000);

    child.stdout.on("data", (chunk) => {
      sawOutput = true;
      this.host.captureSteamCmdOutput(String(chunk), "verify/stdout");
    });
    child.stderr.on("data", (chunk) => {
      sawOutput = true;
      const text = String(chunk);
      stderr += text;
      this.host.captureSteamCmdOutput(text, "verify/stderr");
    });

    child.once("error", (error) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      reject(new Error(`SteamCMD exists but cannot be executed: ${error.message}`));
    });

    child.once("exit", (code) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      if (isSteamCmdVerifyExitAcceptable(code, sawOutput)) {
        resolve();
        return;
      }

      reject(
        new Error(
          `SteamCMD did not respond correctly (exit ${code ?? 1})${
            stderr.length > 0 ? `: ${stderr}` : ""
          }`,
        ),
      );
    });
  });
}
}
