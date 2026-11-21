import rootPackage from "../../../package.json";

const version = rootPackage.version;

/**
 * Must match `build.artifactName` in the root package.json. The name is
 * space-free so GitHub keeps it verbatim and electron-updater's `latest.yml`
 * URL resolves.
 */
function windowsSetupDownloadUrl(ver: string): string {
  const asset = `YARK-server-manager-Setup-${ver}.exe`;
  return `https://github.com/gabomarin/yark/releases/download/v${ver}/${asset}`;
}

/**
 * Public site origin for canonical / Open Graph / JSON-LD.
 * Custom domain on Cloudflare Pages: https://getyark.com/
 */
export const siteOrigin = "https://getyark.com";

/**
 * Cloudflare Worker that sums GitHub Release `.exe` downloads only
 * (excludes `.blockmap`, `latest.yml`, `.sha256`). Override at build time with
 * `PUBLIC_RELEASE_DOWNLOADS_URL`. Same default as the README Shields badge.
 * See docs/release-downloads.md.
 */
const DEFAULT_RELEASE_DOWNLOADS_URL =
  "https://yark-release-downloads.gabomarin26.workers.dev/";

function resolveReleaseDownloadsUrl(): string {
  const fromEnv = import.meta.env.PUBLIC_RELEASE_DOWNLOADS_URL;
  if (typeof fromEnv !== "string") {
    return DEFAULT_RELEASE_DOWNLOADS_URL;
  }
  const trimmed = fromEnv.trim();
  return trimmed || DEFAULT_RELEASE_DOWNLOADS_URL;
}

/** Site content config — version + download URL come from the root package.json. */
export const site = {
  name: "YARK server manager",
  /** Primary SEO title fragment for the marketing home */
  seoTitle:
    "YARK — ARK Survival Ascended dedicated server manager for Windows",
  tagline:
    "Built for people who host local ARK: Survival Ascended dedicated servers on Windows.",
  description:
    "YARK is a free Windows desktop app to manage local ARK: Survival Ascended dedicated servers — profiles, SteamCMD updates, CurseForge mod IDs, backups, logs, clusters, and INI configuration in one place. Public prerelease.",
  keywords: [
    "ARK Survival Ascended server manager",
    "ASA dedicated server manager",
    "ARK Ascended server admin",
    "ARK dedicated server Windows",
    "SteamCMD ASA",
    "ARK server backup",
    "CurseForge ASA mods",
    "YARK server manager",
  ],
  version,
  statusLabel: `Public prerelease · v${version} · not production-ready`,
  repoUrl: "https://github.com/gabomarin/yark",
  releasesUrl: "https://github.com/gabomarin/yark/releases",
  discordUrl: "https://discord.gg/DQ8nes63w7",
  downloadUrl: windowsSetupDownloadUrl(version),
  downloadLabel: "Download for Windows",
  releaseDownloadsUrl: resolveReleaseDownloadsUrl(),
  ogImagePath: "/screenshots/overview.png",
} as const;

export function absoluteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin}${normalized}`;
}

/** Prefix an in-app path with Astro `base` (custom domain root: `/`). */
export function withBase(path = "/"): string {
  const base = import.meta.env.BASE_URL;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("mailto:")) {
    return path;
  }
  if (path === "/") {
    return base;
  }
  return `${base}${path.replace(/^\//, "")}`;
}

export const nav = [
  { href: "/", label: "Home" },
  { href: "/screenshots/", label: "Screenshots" },
  { href: "/docs/", label: "Docs" },
  { href: "/changelog/", label: "Changelog" },
  { href: "/faq/", label: "FAQ" },
] as const;
