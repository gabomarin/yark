import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import {
  buildSteamCmdAppUpdateArgs,
  canSkipAsaContentSync,
  isOperationCancelledError,
  isOperationPausedError,
  OperationCancelledError,
  OperationPausedError,
  resolveAsaContentCacheDir,
  resolveDepotCacheDir,
  resolveSteamCmdHome,
  shouldReuseAsaContentCache,
  steamCmdSpawnEnv,
  syncAsaContentCacheToInstallDir,
} from "./steamcmd-content-cache";
import {
  formatAsaCacheReuseLine,
  formatAsaCacheSyncTargetLine,
  formatAsaCacheUpdateConsoleLine,
  formatSteamCmdCachePathsLine,
  formatSteamCmdInvokeConsoleLines,
  formatSyncCompletedLine,
  formatSyncFailureFallbackLine,
  formatSyncHeartbeatLine,
  resolveAsaCacheSyncCompleteProgress,
  resolveAsaCacheSyncLabel,
  resolveAsaCacheSyncSkippedProgress,
} from "./steamcmd-operator";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type SteamCmdFilesOperation = "install-files" | "update" | "verify-files";

export interface SteamCmdRunDependencies {
  resolveSteamCmdExecutable: () => Promise<string>;
  appendSteamCmdConsole: (line: string, options?: { forceProgressPush?: boolean }) => void;
  assertNotCancelled: () => void;
  beginFileSync: (serverId: string, label: string) => void;
  endFileSync: () => void;
  setProgress: (percent: number | null, label: string | null, line?: string) => void;
  isCancelRequested: () => boolean;
  isPauseRequested: () => boolean;
  setActiveSyncChild: (child: ChildProcess | null) => void;
  beginSteamCmdProcess: (child: ChildProcess, operation: SteamCmdFilesOperation, serverId: string) => void;
  endSteamCmdProcess: (child: ChildProcess) => void;
  startDiskProgressMonitor: (steamCmdHome: string, forceInstallDir: string) => void;
  stopDiskProgressMonitor: () => void;
  captureSteamCmdOutput: (chunk: string, source: string) => void;
}

export class SteamCmdRunner {
  private contentCacheUpdatedAtMs = 0;

  constructor(private readonly deps: SteamCmdRunDependencies) {}

  resetContentCache(): void {
    this.contentCacheUpdatedAtMs = 0;
  }

  async runSteamUpdate(
    installDir: string,
    operation: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<CommandResult> {
    this.deps.assertNotCancelled();
    const steamcmdExe = await this.deps.resolveSteamCmdExecutable();
    const steamCmdHome = resolveSteamCmdHome(steamcmdExe);
    const depotCacheDir = resolveDepotCacheDir(steamCmdHome);
    const contentCacheDir = resolveAsaContentCacheDir(steamCmdHome);

    await mkdir(contentCacheDir, { recursive: true });
    await mkdir(depotCacheDir, { recursive: true });

    this.deps.appendSteamCmdConsole(
      formatSteamCmdCachePathsLine(depotCacheDir, contentCacheDir),
    );

    const cacheResult = await this.ensureAsaContentCache(
      steamcmdExe,
      steamCmdHome,
      contentCacheDir,
      operation,
      serverId,
    );
    this.deps.assertNotCancelled();
    if (cacheResult.code !== 0) {
      return cacheResult;
    }

    this.deps.appendSteamCmdConsole(formatAsaCacheSyncTargetLine(installDir));
    const syncLabel = resolveAsaCacheSyncLabel(operation);
    this.deps.beginFileSync(serverId, syncLabel);
    let syncHeartbeat: ReturnType<typeof setInterval> | null = null;
    try {
      if (canSkipAsaContentSync(contentCacheDir, installDir)) {
        const skipped = resolveAsaCacheSyncSkippedProgress(operation);
        this.deps.appendSteamCmdConsole(
          "ASA cache sync skipped (install dir is the content cache)",
        );
        this.deps.setProgress(skipped.percent, skipped.label, skipped.line);
      } else {
        const syncStartedAt = Date.now();
        syncHeartbeat = setInterval(() => {
          if (this.deps.isCancelRequested() || this.deps.isPauseRequested()) {
            return;
          }
          const elapsedSec = Math.max(1, Math.round((Date.now() - syncStartedAt) / 1000));
          this.deps.appendSteamCmdConsole(formatSyncHeartbeatLine(elapsedSec), {
            forceProgressPush: true,
          });
        }, 5_000);
        const robocopyCode = await syncAsaContentCacheToInstallDir(contentCacheDir, installDir, {
          onSpawn: (child) => {
            this.deps.setActiveSyncChild(child);
          },
          isCancelled: () => this.deps.isCancelRequested() || this.deps.isPauseRequested(),
        });
        this.deps.setActiveSyncChild(null);
        this.deps.appendSteamCmdConsole(formatSyncCompletedLine(robocopyCode));
        const completed = resolveAsaCacheSyncCompleteProgress(operation);
        this.deps.setProgress(completed.percent, completed.label, completed.line);
      }
    } catch (error) {
      this.deps.setActiveSyncChild(null);
      this.deps.endFileSync();
      if (this.deps.isPauseRequested() || isOperationPausedError(error)) {
        throw isOperationPausedError(error) ? error : new OperationPausedError();
      }
      if (isOperationCancelledError(error) || this.deps.isCancelRequested()) {
        throw isOperationCancelledError(error) ? error : new OperationCancelledError();
      }
      const message = error instanceof Error ? error.message : String(error);
      this.deps.appendSteamCmdConsole(formatSyncFailureFallbackLine(message));
      return await this.invokeSteamCmdAppUpdate(
        steamcmdExe,
        steamCmdHome,
        installDir,
        operation,
        serverId,
      );
    } finally {
      if (syncHeartbeat !== null) {
        clearInterval(syncHeartbeat);
      }
    }
    this.deps.endFileSync();

    return { code: 0, stdout: cacheResult.stdout, stderr: cacheResult.stderr };
  }

  private async ensureAsaContentCache(
    steamcmdExe: string,
    steamCmdHome: string,
    contentCacheDir: string,
    operation: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<CommandResult> {
    if (shouldReuseAsaContentCache(operation, contentCacheDir, this.contentCacheUpdatedAtMs)) {
      const ageSec = Math.round((Date.now() - this.contentCacheUpdatedAtMs) / 1000);
      this.deps.appendSteamCmdConsole(formatAsaCacheReuseLine(ageSec));
      return { code: 0, stdout: "", stderr: "" };
    }

    this.deps.appendSteamCmdConsole(
      formatAsaCacheUpdateConsoleLine(operation, steamCmdHome),
    );
    const result = await this.invokeSteamCmdAppUpdate(
      steamcmdExe,
      steamCmdHome,
      contentCacheDir,
      operation,
      serverId,
    );
    if (result.code === 0) {
      this.contentCacheUpdatedAtMs = Date.now();
    } else {
      this.contentCacheUpdatedAtMs = 0;
    }
    return result;
  }

  private async invokeSteamCmdAppUpdate(
    steamcmdExe: string,
    steamCmdHome: string,
    forceInstallDir: string,
    operation: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<CommandResult> {
    const args = buildSteamCmdAppUpdateArgs(forceInstallDir);

    for (const line of formatSteamCmdInvokeConsoleLines({
      operation,
      serverId,
      steamCmdHome,
      steamcmdExe,
      args,
    })) {
      this.deps.appendSteamCmdConsole(line);
    }

    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(steamcmdExe, args, {
        cwd: steamCmdHome,
        windowsHide: true,
        shell: false,
        env: steamCmdSpawnEnv(),
      });
      this.deps.beginSteamCmdProcess(child, operation, serverId);
      this.deps.startDiskProgressMonitor(steamCmdHome, forceInstallDir);

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        const text = String(chunk);
        stdout += text;
        this.deps.captureSteamCmdOutput(text, "update/stdout");
      });
      child.stderr.on("data", (chunk) => {
        const text = String(chunk);
        stderr += text;
        this.deps.captureSteamCmdOutput(text, "update/stderr");
      });

      child.once("error", (error) => {
        this.deps.stopDiskProgressMonitor();
        this.deps.endSteamCmdProcess(child);
        reject(
          new Error(
            `Could not run SteamCMD (${steamcmdExe}). Install or configure it. Detail: ${error.message}`,
          ),
        );
      });

      child.once("exit", (code) => {
        this.deps.stopDiskProgressMonitor();
        this.deps.endSteamCmdProcess(child);
        if (this.deps.isPauseRequested()) {
          reject(new OperationPausedError());
          return;
        }
        if (this.deps.isCancelRequested()) {
          reject(new OperationCancelledError());
          return;
        }
        resolve({
          code: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
  }

}
