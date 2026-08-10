import { app, shell } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import {
  allowsPrereleaseUpdates,
  compareSemver,
  createIdleAppUpdateStatus,
  installBlockMessage,
  parseReleaseVersion,
  pickNewestAllowedRelease,
  YARK_RELEASES_API,
  YARK_RELEASES_URL,
  type AppUpdateInstallBlockReason,
  type AppUpdateStatus,
  type GithubReleaseRef,
} from "../shared/app-update";
import { APP_VERSION } from "../shared/app-version";
import { requireAllowedExternalUrl } from "../shared/external-url-policy";

export type AppUpdateSafetyReason =
  | "servers-running"
  | "critical-job"
  | "operation-in-progress"
  | null;

export interface AppUpdateSafetyGate {
  /** Returns a block reason when install must not quit the app. */
  evaluate(): AppUpdateSafetyReason;
  /** Mark the real quit path so close-to-tray cannot swallow quitAndInstall. */
  prepareQuit?: () => void;
}

type StatusListener = (status: AppUpdateStatus) => void;

/**
 * YARK desktop self-update via electron-updater + GitHub Releases (#165).
 * Never auto-downloads; install only after explicit operator action + safety gates.
 */
export class AppUpdateService {
  private status: AppUpdateStatus;
  private readonly listeners = new Set<StatusListener>();
  private startupTimer: NodeJS.Timeout | null = null;
  private configured = false;

  constructor(
    private readonly safety: AppUpdateSafetyGate,
    private readonly isPackaged = app.isPackaged,
    private readonly currentVersion = APP_VERSION,
  ) {
    this.status = createIdleAppUpdateStatus(this.currentVersion, this.isPackaged);
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): AppUpdateStatus {
    return this.withLiveInstallGate({ ...this.status });
  }

  /** Quiet check ~60s after launch; never downloads. */
  startQuietCheck(delayMs = 60_000): void {
    if (this.startupTimer !== null) return;
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.checkForUpdate().catch((error: unknown) => {
        console.error("Quiet YARK update check failed", error);
      });
    }, delayMs);
    this.startupTimer.unref();
  }

  stopQuietCheck(): void {
    if (this.startupTimer !== null) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
  }

  async checkForUpdate(): Promise<AppUpdateStatus> {
    this.emit({
      ...this.status,
      phase: "checking",
      error: null,
      percent: null,
    });

    try {
      if (this.isPackaged) {
        this.ensureUpdaterConfigured();
        const result = await autoUpdater.checkForUpdates();
        // Events usually update status; if somehow skipped, fall through.
        if (result?.updateInfo !== undefined) {
          const remote = parseReleaseVersion(result.updateInfo.version);
          if (remote !== null && compareSemver(remote, this.currentVersion) > 0) {
            this.applyAvailable(result.updateInfo);
          } else if (this.status.phase === "checking") {
            this.emit({
              ...this.status,
              phase: "up-to-date",
              availableVersion: null,
              releaseNotesUrl: null,
              error: null,
            });
          }
        }
        return this.getStatus();
      }

      await this.checkViaGitHubApi();
      return this.getStatus();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        ...this.status,
        phase: "error",
        error: message,
        percent: null,
      });
      return this.getStatus();
    }
  }

  async downloadUpdate(): Promise<AppUpdateStatus> {
    if (!this.isPackaged) {
      throw new Error("Download is only available in the packaged Windows app.");
    }
    if (this.status.phase !== "available" && this.status.phase !== "ready") {
      if (this.status.phase !== "downloading") {
        throw new Error("Check for a YARK update before downloading.");
      }
    }

    this.ensureUpdaterConfigured();
    this.emit({
      ...this.status,
      phase: "downloading",
      percent: this.status.percent ?? 0,
      error: null,
    });

    try {
      await autoUpdater.downloadUpdate();
      return this.getStatus();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        ...this.status,
        phase: "error",
        error: message,
        percent: null,
      });
      throw error;
    }
  }

  async installUpdate(): Promise<void> {
    if (!this.isPackaged) {
      throw new Error("Install is only available in the packaged Windows app.");
    }
    if (this.status.phase !== "ready") {
      throw new Error("Download the update before restarting to install.");
    }

    const gate = this.safety.evaluate();
    if (gate !== null) {
      const reason: AppUpdateInstallBlockReason = gate;
      this.emit({
        ...this.status,
        installBlockedReason: reason,
        installBlockedMessage: installBlockMessage(reason),
      });
      throw new Error(installBlockMessage(reason) ?? "Cannot install now.");
    }

    // isSilent=false, isForceRunAfter=true — relaunch after NSIS finishes.
    this.safety.prepareQuit?.();
    autoUpdater.quitAndInstall(false, true);
  }

  async openReleaseNotes(): Promise<void> {
    const url = requireAllowedExternalUrl(
      this.status.releaseNotesUrl ?? this.status.releasePageUrl,
    );
    await shell.openExternal(url);
  }

  private ensureUpdaterConfigured(): void {
    if (this.configured) return;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    // 0.x GitHub Releases are all marked prerelease; require stable only from 1.0+.
    autoUpdater.allowPrerelease = allowsPrereleaseUpdates(this.currentVersion);
    autoUpdater.allowDowngrade = false;

    autoUpdater.on("checking-for-update", () => {
      this.emit({
        ...this.status,
        phase: "checking",
        error: null,
      });
    });

    autoUpdater.on("update-available", (info: UpdateInfo) => {
      this.applyAvailable(info);
    });

    autoUpdater.on("update-not-available", () => {
      this.emit({
        ...this.status,
        phase: "up-to-date",
        availableVersion: null,
        releaseNotesUrl: null,
        error: null,
        percent: null,
      });
    });

    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
      this.emit({
        ...this.status,
        phase: "downloading",
        percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
        error: null,
      });
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
      const version = parseReleaseVersion(info.version);
      if (version === null) {
        this.emit({
          ...this.status,
          phase: "error",
          error: "Downloaded update had an invalid version.",
          percent: null,
        });
        return;
      }
      this.emit({
        ...this.status,
        phase: "ready",
        availableVersion: version,
        percent: 100,
        error: null,
        releaseNotesUrl: releaseNotesUrlFor(version),
      });
    });

    autoUpdater.on("error", (error: Error) => {
      this.emit({
        ...this.status,
        phase: "error",
        error: error.message,
        percent: null,
      });
    });

    this.configured = true;
  }

  private applyAvailable(info: UpdateInfo): void {
    const version = parseReleaseVersion(info.version);
    if (version === null) {
      this.emit({
        ...this.status,
        phase: "error",
        error: "Update feed reported an invalid version.",
        availableVersion: null,
        percent: null,
      });
      return;
    }
    this.emit({
      ...this.status,
      phase: "available",
      availableVersion: version,
      releaseNotesUrl: releaseNotesUrlFor(version),
      error: null,
      percent: null,
    });
  }

  private async checkViaGitHubApi(): Promise<void> {
    const response = await fetch(`${YARK_RELEASES_API}?per_page=20`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `YARK-server-manager/${this.currentVersion}`,
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub Releases check failed (${response.status}).`);
    }
    const body = (await response.json()) as GithubReleaseRef[];
    if (!Array.isArray(body)) {
      throw new Error("GitHub Releases response was not a list.");
    }
    const newest = pickNewestAllowedRelease(body, this.currentVersion);
    if (newest === null) {
      throw new Error("No published GitHub Releases found.");
    }
    const remote = parseReleaseVersion(newest.tag_name ?? "");
    if (remote === null) {
      throw new Error("GitHub Releases response had no usable version tag.");
    }
    if (compareSemver(remote, this.currentVersion) > 0) {
      this.emit({
        ...this.status,
        phase: "available",
        availableVersion: remote,
        releaseNotesUrl:
          typeof newest.html_url === "string" && newest.html_url.length > 0
            ? newest.html_url
            : releaseNotesUrlFor(remote),
        error: null,
        percent: null,
      });
      return;
    }
    this.emit({
      ...this.status,
      phase: "up-to-date",
      availableVersion: null,
      releaseNotesUrl: null,
      error: null,
      percent: null,
    });
  }

  private withLiveInstallGate(status: AppUpdateStatus): AppUpdateStatus {
    if (!status.isPackaged) {
      return {
        ...status,
        installBlockedReason: "dev",
        installBlockedMessage: installBlockMessage("dev"),
      };
    }
    if (status.phase !== "ready") {
      return {
        ...status,
        installBlockedReason: "not-ready",
        installBlockedMessage: installBlockMessage("not-ready"),
      };
    }
    const gate = this.safety.evaluate();
    if (gate !== null) {
      return {
        ...status,
        installBlockedReason: gate,
        installBlockedMessage: installBlockMessage(gate),
      };
    }
    return {
      ...status,
      installBlockedReason: null,
      installBlockedMessage: null,
    };
  }

  private emit(next: AppUpdateStatus): void {
    this.status = this.withLiveInstallGate(next);
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }
}

function releaseNotesUrlFor(version: string): string {
  const parsed = parseReleaseVersion(version);
  if (parsed === null) {
    return YARK_RELEASES_URL;
  }
  return `${YARK_RELEASES_URL}/tag/v${parsed}`;
}
