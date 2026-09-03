import type {
  InstallationHealthStatus,
  ServerInstallationInfo,
} from "@shared/types";

/** Build a `ServerInstallationInfo` for unit/UI tests (#57 health fields). */
export function stubInstallationInfo(
  partial: Partial<ServerInstallationInfo> &
    Pick<ServerInstallationInfo, "serverId">,
): ServerInstallationInfo {
  const installed = partial.installed ?? partial.health === "ready";
  const health: InstallationHealthStatus =
    partial.health ?? (installed ? "ready" : "missing");
  const ready = health === "ready";
  return {
    serverId: partial.serverId,
    installed: ready,
    health,
    reasonCodes:
      partial.reasonCodes ??
      (ready ? ["ready"] : health === "empty" ? ["dir_empty"] : ["path_missing"]),
    guidance:
      partial.guidance ??
      (ready
        ? "Installation looks ready to start."
        : "Install ASA server files into this folder with Install / SteamCMD."),
    build: partial.build ?? null,
    steamBuild: partial.steamBuild ?? null,
    arkVersion: partial.arkVersion ?? null,
    versionRefreshPending: partial.versionRefreshPending ?? false,
    version: partial.version ?? partial.build ?? null,
    binaryPath:
      partial.binaryPath ??
      `C:\\servers\\${partial.serverId}\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe`,
    checkedAt: partial.checkedAt ?? new Date().toISOString(),
  };
}
