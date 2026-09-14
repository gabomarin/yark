import { createWriteStream, existsSync } from "node:fs";
import { dirname } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { mkdir, rm } from "node:fs/promises";
import { extractZip } from "../backups/backup-archive";
import { formatSteamCmdByteProgress } from "@shared/steamcmd-progress";
import type { AsaApiInstallProgress, AsaApiStatus } from "@shared/types";
import {
  ASA_API_GITHUB_OWNER,
  ASA_API_GITHUB_REPO,
  ASA_API_LOADER_GITHUB_REPO,
  ASA_API_RELEASES_LATEST,
  ASA_API_VERSION_LOADER_RELEASES_LATEST,
  asaApiCoreDllPath,
  asaApiLoaderPath,
  asaApiVersionDllDisabledPath,
  asaApiVersionDllPath,
  asaWin64Dir,
} from "./asa-api-paths";
import {
  asaApiCachedZipPartialPath,
  asaApiCachedZipPath,
  finalizeAsaApiCacheDownload,
  pruneAsaApiRepoCache,
  resolveAsaApiCachedZip,
} from "./asa-api-cache";
import { readAsaApiStatus } from "./asa-api-status";

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  content_type?: string;
  size?: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  assets: GitHubReleaseAsset[];
}

export interface InstallAsaApiOptions {
  serverId: string;
  /** YARK userData cache root for AsaApi zips (`…/cache/asa-api`). */
  cacheDir: string;
  onProgress?: (payload: AsaApiInstallProgress) => void;
}

function pickZipAsset(
  release: GitHubRelease,
  preferredName: RegExp,
  repoLabel: string,
): GitHubReleaseAsset {
  const assets = release.assets ?? [];
  const zip =
    assets.find((a) => preferredName.test(a.name)) ??
    assets.find((a) => /\.zip$/i.test(a.name));
  if (zip === undefined) {
    throw new Error(
      `No zip asset found on ${repoLabel} release ${release.tag_name}`,
    );
  }
  return zip;
}

async function fetchLatestRelease(url: string, repoLabel: string): Promise<GitHubRelease> {
  const releaseResponse = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "YARK-server-manager",
    },
  });
  if (!releaseResponse.ok) {
    throw new Error(
      `Could not reach GitHub releases for ${repoLabel} (${releaseResponse.status})`,
    );
  }
  return (await releaseResponse.json()) as GitHubRelease;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function downloadToFile(
  url: string,
  destPath: string,
  expectedSize: number | null,
  onBytes: (downloaded: number, total: number | null) => void,
): Promise<void> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "YARK-server-manager",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for AsaApi release asset`);
  }
  if (response.body === null) {
    throw new Error("Download failed: empty response body");
  }

  const headerTotal = Number(response.headers.get("content-length"));
  const total =
    Number.isFinite(headerTotal) && headerTotal > 0
      ? headerTotal
      : expectedSize !== null && expectedSize > 0
        ? expectedSize
        : null;

  let downloaded = 0;
  let lastEmitAt = 0;
  await mkdir(dirname(destPath), { recursive: true });
  const nodeStream = Readable.fromWeb(
    response.body as import("node:stream/web").ReadableStream,
  );
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.length;
      const now = Date.now();
      if (now - lastEmitAt >= 150 || (total !== null && downloaded >= total)) {
        lastEmitAt = now;
        onBytes(downloaded, total);
      }
      callback(null, chunk);
    },
  });
  await pipeline(nodeStream, counter, createWriteStream(destPath));
  onBytes(downloaded, total ?? downloaded);
}

type ProgressEmit = (
  partial: Omit<AsaApiInstallProgress, "serverId" | "active" | "error"> & {
    active?: boolean;
    error?: string | null;
  },
) => void;

async function obtainZip(
  options: {
    cacheDir: string;
    repo: string;
    tag: string;
    asset: GitHubReleaseAsset;
    expectedSize: number;
    emit: ProgressEmit;
    downloadLabel: (byteSuffix: string) => string;
    cachedLabel: string;
    downloadPercentBase: number;
    downloadPercentSpan: number;
    budgetBytesSoFar: number;
    downloadBudget: number;
  },
): Promise<{ zipPath: string; fromCache: boolean }> {
  const cached = await resolveAsaApiCachedZip(
    options.cacheDir,
    options.repo,
    options.tag,
    options.asset.name,
    options.expectedSize,
  );
  if (cached !== null) {
    options.emit({
      phase: "downloading",
      label: options.cachedLabel,
      percent: clampPercent(
        options.downloadPercentBase + options.downloadPercentSpan,
      ),
      bytesDownloaded: options.budgetBytesSoFar + options.expectedSize,
      bytesTotal: options.downloadBudget,
      assetLabel: options.asset.name,
    });
    return { zipPath: cached, fromCache: true };
  }

  const finalPath = asaApiCachedZipPath(
    options.cacheDir,
    options.repo,
    options.tag,
    options.asset.name,
  );
  const partialPath = asaApiCachedZipPartialPath(finalPath);
  await rm(partialPath, { force: true }).catch(() => {
    // ignore
  });

  await downloadToFile(
    options.asset.browser_download_url,
    partialPath,
    options.expectedSize,
    (downloaded, total) => {
      const knownTotal = total ?? options.expectedSize;
      const span =
        knownTotal > 0
          ? (downloaded / knownTotal) * options.downloadPercentSpan
          : 0;
      const byteLabel =
        knownTotal > 0
          ? ` · ${formatSteamCmdByteProgress(downloaded, knownTotal)}`
          : "";
      options.emit({
        phase: "downloading",
        label: options.downloadLabel(byteLabel),
        percent: clampPercent(options.downloadPercentBase + span),
        bytesDownloaded: options.budgetBytesSoFar + downloaded,
        bytesTotal: options.downloadBudget,
        assetLabel: options.asset.name,
      });
    },
  );

  await finalizeAsaApiCacheDownload(partialPath, finalPath);
  await pruneAsaApiRepoCache(options.cacheDir, options.repo);
  return { zipPath: finalPath, fromCache: false };
}

/**
 * Download latest AsaApi + Version.dll into install Win64 (zips cached under
 * YARK userData). Does not enable profile Start flags.
 */
export async function installAsaApiIntoInstall(
  installDir: string,
  options: InstallAsaApiOptions,
): Promise<AsaApiStatus> {
  const { serverId, cacheDir, onProgress } = options;
  const win64 = asaWin64Dir(installDir);

  const emit: ProgressEmit = (partial) => {
    onProgress?.({
      serverId,
      active: partial.active ?? true,
      phase: partial.phase,
      label: partial.label,
      percent: partial.percent,
      bytesDownloaded: partial.bytesDownloaded,
      bytesTotal: partial.bytesTotal,
      assetLabel: partial.assetLabel,
      error: partial.error ?? null,
    });
  };

  emit({
    phase: "resolving",
    label: "Looking up the latest Ark Server API…",
    percent: 2,
    bytesDownloaded: null,
    bytesTotal: null,
    assetLabel: null,
  });

  await mkdir(cacheDir, { recursive: true });

  const [asaRelease, versionRelease] = await Promise.all([
    fetchLatestRelease(
      ASA_API_RELEASES_LATEST,
      `${ASA_API_GITHUB_OWNER}/${ASA_API_GITHUB_REPO}`,
    ),
    fetchLatestRelease(
      ASA_API_VERSION_LOADER_RELEASES_LATEST,
      `${ASA_API_GITHUB_OWNER}/${ASA_API_LOADER_GITHUB_REPO}`,
    ),
  ]);

  const asaAsset = pickZipAsset(
    asaRelease,
    /^AsaApi_.*\.zip$/i,
    `${ASA_API_GITHUB_OWNER}/${ASA_API_GITHUB_REPO}`,
  );
  const versionAsset = pickZipAsset(
    versionRelease,
    /VersionLoader|Version.*\.zip$/i,
    `${ASA_API_GITHUB_OWNER}/${ASA_API_LOADER_GITHUB_REPO}`,
  );

  const asaTag = asaRelease.tag_name || asaRelease.name || asaAsset.name;
  const versionTag =
    versionRelease.tag_name || versionRelease.name || versionAsset.name;
  const asaBytes = asaAsset.size && asaAsset.size > 0 ? asaAsset.size : 28_000_000;
  const versionBytes =
    versionAsset.size && versionAsset.size > 0 ? versionAsset.size : 400_000;
  const downloadBudget = asaBytes + versionBytes;

  const asaZip = await obtainZip({
    cacheDir,
    repo: ASA_API_GITHUB_REPO,
    tag: asaTag,
    asset: asaAsset,
    expectedSize: asaBytes,
    emit,
    downloadLabel: (byteSuffix) => `Downloading AsaApi ${asaTag}${byteSuffix}`,
    cachedLabel: `Using cached AsaApi ${asaTag}…`,
    downloadPercentBase: 5,
    downloadPercentSpan: 70,
    budgetBytesSoFar: 0,
    downloadBudget,
  });

  emit({
    phase: "extracting",
    label: asaZip.fromCache
      ? "Unpacking cached AsaApi into the server folder…"
      : "Unpacking AsaApi into the server folder…",
    percent: 78,
    bytesDownloaded: asaBytes,
    bytesTotal: downloadBudget,
    assetLabel: asaAsset.name,
  });
  await extractZip(asaZip.zipPath, win64);

  const versionZip = await obtainZip({
    cacheDir,
    repo: ASA_API_LOADER_GITHUB_REPO,
    tag: versionTag,
    asset: versionAsset,
    expectedSize: versionBytes,
    emit,
    downloadLabel: (byteSuffix) => `Downloading Version.dll${byteSuffix}`,
    cachedLabel: `Using cached Version.dll (${versionTag})…`,
    downloadPercentBase: 82,
    downloadPercentSpan: 10,
    budgetBytesSoFar: asaBytes,
    downloadBudget,
  });

  emit({
    phase: "extracting",
    label: versionZip.fromCache
      ? "Unpacking cached Version.dll…"
      : "Unpacking Version.dll…",
    percent: 94,
    bytesDownloaded: downloadBudget,
    bytesTotal: downloadBudget,
    assetLabel: versionAsset.name,
  });
  await extractZip(versionZip.zipPath, win64);

  // VersionLoader always writes Version.dll. Drop any parked YARK-off copy so
  // syncAsaApiVersionDll cannot prefer a stale park over this extract.
  const parkedVersionDll = asaApiVersionDllDisabledPath(installDir);
  if (existsSync(parkedVersionDll)) {
    await rm(parkedVersionDll, { force: true });
  }

  emit({
    phase: "finishing",
    label: "Checking that files are in place…",
    percent: 97,
    bytesDownloaded: downloadBudget,
    bytesTotal: downloadBudget,
    assetLabel: null,
  });

  const status = await readAsaApiStatus(installDir);
  if (!status.loaderPresent) {
    throw new Error(
      `AsaApi extract finished but AsaApiLoader.exe was not found at ${asaApiLoaderPath(installDir)}. ` +
        `Check the release archive layout for ${asaRelease.tag_name}.`,
    );
  }
  if (!status.versionDllPresent && !status.versionDllDisabledPresent) {
    throw new Error(
      `Version.dll was not found at ${asaApiVersionDllPath(installDir)} after extracting ` +
        `${ASA_API_LOADER_GITHUB_REPO} ${versionRelease.tag_name}.`,
    );
  }
  if (!status.apiCorePresent) {
    throw new Error(
      `ArkApi\\AsaApi.dll was not found at ${asaApiCoreDllPath(installDir)} after extract.`,
    );
  }

  emit({
    phase: "finishing",
    label: `Ark Server API ${asaRelease.tag_name || "latest"} is ready`,
    percent: 100,
    bytesDownloaded: downloadBudget,
    bytesTotal: downloadBudget,
    assetLabel: null,
    active: false,
  });

  return {
    ...status,
    installedVersionLabel: asaRelease.tag_name || asaRelease.name || null,
  };
}
