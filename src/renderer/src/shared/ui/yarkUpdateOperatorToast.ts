import type { AppUpdateStatus } from "@shared/app-update";

/** Stable key so we toast once per phase+version (quiet check + Settings Check now). */
export function yarkUpdateToastDedupeKey(status: AppUpdateStatus): string | null {
  const version = status.availableVersion?.trim() ?? "";
  if (version.length === 0) return null;
  if (status.phase === "available") return `available:${version}`;
  if (status.phase === "ready") return `ready:${version}`;
  return null;
}

export function yarkUpdateToastCopy(
  status: AppUpdateStatus,
): { title: string; message: string } | null {
  const version = status.availableVersion?.trim() ?? "";
  if (version.length === 0) return null;
  if (status.phase === "available") {
    return {
      title: "YARK update available",
      message: `v${version} is ready to download. Open Settings → YARK updates (or click the version in the sidebar).`,
    };
  }
  if (status.phase === "ready") {
    return {
      title: "YARK update ready to install",
      message: `v${version} is downloaded. Open Settings → YARK updates to restart and install.`,
    };
  }
  return null;
}
