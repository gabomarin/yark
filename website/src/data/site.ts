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
 * GitHub project Pages: https://gabomarin.github.io/yark/
 */
export const siteOrigin = "https://gabomarin.github.io/yark";

/** Site content config — version + download URL come from the root package.json. */
export const site = {
  name: "YARK server manager",
  /** Primary SEO title fragment for the marketing home */
  seoTitle:
    "YARK — ARK Survival Ascended dedicated server manager for Windows",
  tagline:
    "Built for people who host local ARK: Survival Ascended dedicated servers on Windows.",
  description:
    "YARK is a free Windows desktop app to manage local ARK: Survival Ascended dedicated servers — profiles, SteamCMD updates, CurseForge mod IDs, backups, logs, clusters, and INI configuration in one place. Public unsigned prerelease.",
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
  downloadUrl: windowsSetupDownloadUrl(version),
  downloadLabel: "Download for Windows",
  ogImagePath: "/screenshots/overview.png",
} as const;

export function absoluteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin}${normalized}`;
}

/** Prefix an in-app path with Astro `base` (GitHub Pages: `/yark/`). */
export function withBase(path = "/"): string {
  const base = import.meta.env.BASE_URL;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("mailto:")) {
    return path;
  }
  if (path.startsWith("/#")) {
    return `${base.replace(/\/$/, "")}${path}`;
  }
  if (path === "/") {
    return base;
  }
  return `${base}${path.replace(/^\//, "")}`;
}

export const nav = [
  { href: "/", label: "Home" },
  { href: "/#screenshots", label: "Screenshots" },
  { href: "/docs/", label: "Docs" },
  { href: "/changelog/", label: "Changelog" },
  { href: "/faq/", label: "FAQ" },
] as const;
