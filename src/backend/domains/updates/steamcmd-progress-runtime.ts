import { existsSync, statSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import type { SteamCmdConsoleSnapshot } from "../../../shared/types";
import {
  parseSteamCmdProgressLine,
  formatSteamCmdByteProgress,
} from "../../../shared/steamcmd-progress";
import {
  STEAMCMD_CONSOLE_MAX_LINES,
  STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_DELTA,
  STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_MS,
  appendSteamCmdConsoleRing,
  clampSteamCmdConsoleLimit,
  formatTimestampedSteamCmdLine,
  shouldLogProgressTickToConsole,
  splitSteamCmdOutputChunk,
  steamCmdProgressPercentChanged,
  stripSteamCmdBareLine,
  stripSteamCmdProgressIngestPrefix,
} from "./steamcmd-console";
import {
  estimateProgressFromDisk,
  measureInstallDownloadingBytes,
  readConsoleLogSince,
  readInstallAppManifestProgress,
  steamCmdConsoleLogPath,
} from "./steamcmd-disk-progress";
import {
  formatDiskProgressLogPathLine,
  planSteamCmdProcessProgressStart,
  shouldPreferOfficialProgressOverDiskEstimate,
} from "./steamcmd-operator";
import { ASA_APP_ID } from "./steamcmd-content-cache";

const PROGRESS_PUSH_MIN_MS = 100;

export interface ActiveSteamCmdOperation {
  child: ChildProcess;
  operation: "install-steamcmd" | "install-files" | "update" | "verify-files";
  serverId: string | null;
  startedAt: string;
}

export interface SteamCmdProgressSnapshot {
  percent: number | null;
  label: string | null;
  bytesDownloaded: number | null;
  bytesTotal: number | null;
}

interface SteamCmdProgressRuntimeDependencies {
  emitProgress: () => void;
  isCancelRequested: () => boolean;
  isPauseRequested: () => boolean;
}

export class SteamCmdProgressRuntime {
  private consoleLines: string[] = [];
  private consoleUpdatedAt = new Date(0).toISOString();
  private activeSteamCmd: ActiveSteamCmdOperation | null = null;
  private progressPercent: number | null = null;
  private progressLabel: string | null = null;
  private progressBytesDownloaded: number | null = null;
  private progressBytesTotal: number | null = null;
  private pausedProgressSnapshot: SteamCmdProgressSnapshot | null = null;
  private lastProgressLine: string | null = null;
  private syncingServerId: string | null = null;
  private syncingStartedAt: string | null = null;
  private activeSyncChild: ChildProcess | null = null;
  private lastProgressPushAtMs = 0;
  private lastProgressConsoleLogAtMs = 0;
  private lastProgressConsoleLoggedPercent: number | null = null;
  private outputBuffers = new Map<string, string>();
  private lastOfficialProgressAtMs = 0;
  private diskProgressTimer: ReturnType<typeof setInterval> | null = null;
  private diskProgressInFlight = false;
  private diskProgressForceInstallDir: string | null = null;
  private diskProgressSteamCmdHome: string | null = null;
  private diskProgressBaselineBytes = 0;
  private consoleLogOffset = 0;
  private lastDiskEstimateConsoleAtMs = 0;

  constructor(private readonly deps: SteamCmdProgressRuntimeDependencies) {}

  getActiveSteamCmd(): ActiveSteamCmdOperation | null {
    return this.activeSteamCmd;
  }

  getActiveSyncChild(): ChildProcess | null {
    return this.activeSyncChild;
  }

  setActiveSyncChild(child: ChildProcess | null): void {
    this.activeSyncChild = child;
  }

  takeActiveSteamCmdChild(): ChildProcess | null {
    const child = this.activeSteamCmd?.child ?? null;
    this.activeSteamCmd = null;
    return child;
  }

  takeActiveSyncChild(): ChildProcess | null {
    const child = this.activeSyncChild;
    this.activeSyncChild = null;
    return child;
  }

  getSyncingServerId(): string | null {
    return this.syncingServerId;
  }

  getSyncingStartedAt(): string | null {
    return this.syncingStartedAt;
  }

  clearSyncing(): void {
    this.syncingServerId = null;
    this.syncingStartedAt = null;
  }

  getProgressSnapshot(): SteamCmdProgressSnapshot {
    return {
      percent: this.progressPercent,
      label: this.progressLabel,
      bytesDownloaded: this.progressBytesDownloaded,
      bytesTotal: this.progressBytesTotal,
    };
  }

  getPausedProgressSnapshot(): SteamCmdProgressSnapshot | null {
    return this.pausedProgressSnapshot;
  }

  getLastProgressLine(): string | null {
    return this.lastProgressLine;
  }

  setQueuedProgress(label: string, line: string): void {
    this.progressLabel = label;
    this.lastProgressLine = line;
  }

  getConsole(limit = 200): SteamCmdConsoleSnapshot {
    const safeLimit = clampSteamCmdConsoleLimit(limit);
    return {
      lines: this.consoleLines.slice(-safeLimit),
      updatedAt: this.consoleUpdatedAt,
    };
  }

  clearConsole(): void {
    this.consoleLines.length = 0;
    this.consoleUpdatedAt = new Date().toISOString();
  }

  appendConsole(line: string, options?: { forceProgressPush?: boolean }): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }
    this.consoleLines = appendSteamCmdConsoleRing(
      this.consoleLines,
      formatTimestampedSteamCmdLine(new Date().toISOString(), trimmed),
      STEAMCMD_CONSOLE_MAX_LINES,
    );
    this.consoleUpdatedAt = new Date().toISOString();
    this.lastProgressLine = trimmed;
    const percentChanged = this.ingestProgressFromLine(trimmed);
    this.emitProgress(options?.forceProgressPush === true || percentChanged);
  }

  captureOutput(chunk: string, source: string): void {
    const previous = this.outputBuffers.get(source) ?? "";
    const { completeLines, remainder } = splitSteamCmdOutputChunk(previous, chunk);
    this.outputBuffers.set(source, remainder);
    for (const line of completeLines) {
      this.handleOutputLine(line, source);
    }
  }

  startDiskProgressMonitor(steamCmdHome: string, forceInstallDir: string): void {
    this.stopDiskProgressMonitor();
    this.diskProgressForceInstallDir = forceInstallDir;
    this.diskProgressSteamCmdHome = steamCmdHome;
    this.lastOfficialProgressAtMs = 0;
    this.lastDiskEstimateConsoleAtMs = 0;

    const logPath = steamCmdConsoleLogPath(steamCmdHome);
    if (existsSync(logPath)) {
      try {
        this.consoleLogOffset = statSync(logPath).size;
      } catch {
        this.consoleLogOffset = 0;
      }
    } else {
      this.consoleLogOffset = 0;
    }

    void measureInstallDownloadingBytes(forceInstallDir).then((baseline) => {
      if (this.diskProgressForceInstallDir === forceInstallDir) {
        this.diskProgressBaselineBytes = baseline;
      }
    });
    this.appendConsole(formatDiskProgressLogPathLine(logPath));
    this.diskProgressTimer = setInterval(() => {
      void this.tickDiskProgressEstimate();
    }, 400);
  }

  stopDiskProgressMonitor(): void {
    if (this.diskProgressTimer !== null) {
      clearInterval(this.diskProgressTimer);
      this.diskProgressTimer = null;
    }
    this.diskProgressForceInstallDir = null;
    this.diskProgressSteamCmdHome = null;
    this.diskProgressInFlight = false;
  }

  clearPausedProgressSnapshot(): void {
    this.pausedProgressSnapshot = null;
  }

  setPausedProgress(): void {
    this.freezePausedProgressSnapshot();
    this.setProgress(null, "Paused", "Paused");
  }

  setProgress(percent: number | null, label: string | null, line?: string): void {
    this.progressPercent = percent;
    if (label !== null) {
      this.progressLabel = label;
    }
    if (percent === 0 || percent === null) {
      this.progressBytesDownloaded = null;
      this.progressBytesTotal = null;
    }
    if (line !== undefined) {
      this.lastProgressLine = line;
    }
    this.emitProgress(true);
  }

  beginFileSync(serverId: string, label: string): void {
    this.syncingServerId = serverId;
    this.syncingStartedAt = new Date().toISOString();
    this.progressBytesDownloaded = null;
    this.progressBytesTotal = null;
    this.progressPercent = null;
    this.progressLabel = label;
    this.lastProgressLine = label;
    this.emitProgress(true);
  }

  endFileSync(): void {
    this.syncingServerId = null;
    this.syncingStartedAt = null;
    this.activeSyncChild = null;
    this.emitProgress(true);
  }

  beginSteamCmdProcess(
    child: ChildProcess,
    operation: ActiveSteamCmdOperation["operation"],
    serverId: string | null,
  ): void {
    if (this.activeSteamCmd !== null) {
      throw new Error("A SteamCMD operation is already in progress");
    }
    this.clearPausedProgressSnapshot();
    this.outputBuffers.clear();
    this.lastProgressConsoleLogAtMs = 0;
    this.lastProgressConsoleLoggedPercent = null;
    const progressStart = planSteamCmdProcessProgressStart(operation);
    this.setProgress(progressStart.percent, progressStart.label, progressStart.line);
    this.activeSteamCmd = {
      child,
      operation,
      serverId,
      startedAt: new Date().toISOString(),
    };
    this.emitProgress(true);
  }

  endSteamCmdProcess(child: ChildProcess): void {
    if (this.activeSteamCmd?.child !== child) {
      return;
    }
    for (const [source, remainder] of this.outputBuffers) {
      const trimmed = remainder.trim();
      if (trimmed.length > 0) {
        this.handleOutputLine(trimmed, source);
      }
    }
    this.outputBuffers.clear();
    this.activeSteamCmd = null;
    this.emitProgress(true);
  }

  emitProgress(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastProgressPushAtMs < PROGRESS_PUSH_MIN_MS) {
      return;
    }
    this.lastProgressPushAtMs = now;
    this.deps.emitProgress();
  }

  private async tickDiskProgressEstimate(): Promise<void> {
    const installDir = this.diskProgressForceInstallDir;
    const steamCmdHome = this.diskProgressSteamCmdHome;
    if (
      installDir === null
      || steamCmdHome === null
      || this.diskProgressInFlight
      || this.deps.isCancelRequested()
      || this.deps.isPauseRequested()
    ) {
      return;
    }

    this.diskProgressInFlight = true;
    try {
      const logChunk = await readConsoleLogSince(steamCmdHome, this.consoleLogOffset);
      this.consoleLogOffset = logChunk.nextOffset;
      if (logChunk.text.length > 0) {
        this.captureOutput(logChunk.text, "console_log");
      }
      if (
        shouldPreferOfficialProgressOverDiskEstimate(
          this.lastOfficialProgressAtMs,
          Date.now(),
        )
      ) {
        return;
      }

      const manifest = await readInstallAppManifestProgress(installDir, ASA_APP_ID);
      if (
        manifest !== null
        && manifest.bytesDownloaded !== null
        && manifest.bytesToDownload !== null
        && manifest.bytesToDownload > 0
      ) {
        this.progressBytesDownloaded = manifest.bytesDownloaded;
        this.progressBytesTotal = manifest.bytesToDownload;
        if (manifest.percent !== null) {
          this.progressPercent = manifest.percent;
        }
        this.progressLabel = `Downloading · ${formatSteamCmdByteProgress(
          manifest.bytesDownloaded,
          manifest.bytesToDownload,
        )}`;
        this.lastProgressLine = this.progressLabel;
        this.emitProgress(true);
        return;
      }

      const bytesOnDisk = await measureInstallDownloadingBytes(installDir);
      if (
        this.diskProgressForceInstallDir !== installDir
        || this.deps.isCancelRequested()
        || this.deps.isPauseRequested()
      ) {
        return;
      }
      const estimate = estimateProgressFromDisk(
        bytesOnDisk,
        this.progressBytesTotal,
        this.diskProgressBaselineBytes,
      );
      if (estimate.downloaded < 1_000_000 && estimate.deltaBytes < 1_000_000) {
        return;
      }

      this.progressPercent = estimate.percent;
      this.progressBytesDownloaded = estimate.downloaded;
      this.progressBytesTotal = estimate.total;
      this.progressLabel = `Downloading (estimated) · ${formatSteamCmdByteProgress(
        estimate.downloaded,
        estimate.total,
      )}`;
      this.lastProgressLine = this.progressLabel;
      this.emitProgress(true);

      const now = Date.now();
      if (now - this.lastDiskEstimateConsoleAtMs >= 5000) {
        this.lastDiskEstimateConsoleAtMs = now;
        this.consoleLines = appendSteamCmdConsoleRing(
          this.consoleLines,
          formatTimestampedSteamCmdLine(
            new Date().toISOString(),
            `[estimated/downloading] ${estimate.percent.toFixed(1)}% — ${formatSteamCmdByteProgress(estimate.downloaded, estimate.total)}`,
          ),
          STEAMCMD_CONSOLE_MAX_LINES,
        );
        this.consoleUpdatedAt = new Date().toISOString();
        this.emitProgress(true);
      }
    } finally {
      this.diskProgressInFlight = false;
    }
  }

  private handleOutputLine(line: string, source: string): void {
    const bare = stripSteamCmdBareLine(line);
    const parsed = parseSteamCmdProgressLine(bare);
    if (parsed.percent === null) {
      this.appendConsole(`[${source}] ${line}`, { forceProgressPush: true });
      return;
    }

    const now = Date.now();
    const previousPercent = this.progressPercent;
    this.progressPercent = parsed.percent;
    if (parsed.label !== null) this.progressLabel = parsed.label;
    if (parsed.bytesDownloaded !== null) {
      this.progressBytesDownloaded = parsed.bytesDownloaded;
    }
    if (parsed.bytesTotal !== null) this.progressBytesTotal = parsed.bytesTotal;
    this.lastProgressLine = bare;
    this.lastOfficialProgressAtMs = now;
    const percentChanged = steamCmdProgressPercentChanged(previousPercent, parsed.percent);
    this.emitProgress(percentChanged);

    if (
      shouldLogProgressTickToConsole({
        nowMs: now,
        lastLogAtMs: this.lastProgressConsoleLogAtMs,
        minLogIntervalMs: STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_MS,
        parsedPercent: parsed.percent,
        lastLoggedPercent: this.lastProgressConsoleLoggedPercent,
        minPercentDelta: STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_DELTA,
      })
    ) {
      this.lastProgressConsoleLogAtMs = now;
      this.lastProgressConsoleLoggedPercent = parsed.percent;
      this.consoleLines = appendSteamCmdConsoleRing(
        this.consoleLines,
        formatTimestampedSteamCmdLine(new Date().toISOString(), `[${source}] ${bare}`),
        STEAMCMD_CONSOLE_MAX_LINES,
      );
      this.consoleUpdatedAt = new Date().toISOString();
      this.emitProgress(true);
    }
  }

  private ingestProgressFromLine(line: string): boolean {
    const parsed = parseSteamCmdProgressLine(stripSteamCmdProgressIngestPrefix(line));
    let percentChanged = false;
    if (parsed.percent !== null) {
      percentChanged = steamCmdProgressPercentChanged(this.progressPercent, parsed.percent);
      this.progressPercent = parsed.percent;
    }
    if (parsed.label !== null) this.progressLabel = parsed.label;
    if (parsed.bytesDownloaded !== null) {
      this.progressBytesDownloaded = parsed.bytesDownloaded;
    }
    if (parsed.bytesTotal !== null) this.progressBytesTotal = parsed.bytesTotal;
    if (parsed.percent !== null || parsed.bytesDownloaded !== null) {
      this.lastOfficialProgressAtMs = Date.now();
    }
    return percentChanged;
  }

  private freezePausedProgressSnapshot(): void {
    if (
      this.progressPercent === null
      && this.progressBytesDownloaded === null
      && this.progressBytesTotal === null
    ) {
      return;
    }
    this.pausedProgressSnapshot = this.getProgressSnapshot();
  }
}
