import type {
  InstallationHealthStatus,
  InstallationServersMode,
  OfficialNetworkStatus,
  ServerInstallationInfo,
  ServerProfile,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import {
  inspectServerInstallationAsync,
  readOfficialArkBuildCached,
  readOfficialArkVersionCached,
} from "./server-installation";
import { isInstallHealthDegradation } from "@shared/installation-health";
import { resolveDisplayedServerVersion } from "@shared/server-version-display";
import {
  FLEET_INSPECT_CONCURRENCY,
  mapPool,
} from "./instance-lifecycle";
import {
  buildFleetInspectKey,
  fleetServerSetChanged,
  shouldInspectFleetInstallations,
} from "./instance-profile";

export const ENRICHED_INSTALL_INSPECT = {
  bypassCache: true,
  allowExecutableVersionProbe: true,
  allowLogVersionProbe: true,
} as const;

export interface InstanceFleetInstallDeps {
  repo: ServerRepository;
}

/**
 * Fleet installation inspect and health memory for InstanceService.
 */
export class InstanceFleetInstall {
  private lastOfficialVersion: string | null | undefined = undefined;
  private lastOfficialSteamBuild: string | null | undefined = undefined;
  private lastInstallServers: ServerInstallationInfo[] = [];
  /** Last classified health per server — used for degradation-only events (#57). */
  private readonly lastKnownInstallHealth = new Map<string, InstallationHealthStatus>();
  /** Coalesce concurrent full-fleet installation inspects for the same profile set + cache mode. */
  private fleetInspectInFlight: {
    key: string;
    promise: Promise<ServerInstallationInfo[]>;
  } | null = null;

  constructor(private readonly deps: InstanceFleetInstallDeps) {}

  clearServer(serverId: string): void {
    this.lastInstallServers = this.lastInstallServers.filter(
      (info) => info.serverId !== serverId,
    );
    this.lastKnownInstallHealth.delete(serverId);
  }

async installationInfo(
  forceOfficialCheck = false,
  serversMode: InstallationServersMode = true,
): Promise<{
  officialVersion: string | null;
  officialNetworkStatus: OfficialNetworkStatus;
  officialSteamBuild: string | null;
  servers: ServerInstallationInfo[];
}> {
  const [officialProbe, officialSteamBuild] = await Promise.all([
    readOfficialArkVersionCached(forceOfficialCheck),
    readOfficialArkBuildCached(forceOfficialCheck),
  ]);
  const officialVersion = officialProbe.version;
  const officialNetworkStatus = officialProbe.networkStatus;

  const profiles = this.deps.repo.list();
  const officialChanged =
    this.lastOfficialVersion !== officialVersion ||
    this.lastOfficialSteamBuild !== officialSteamBuild;
  const serverSetChanged = fleetServerSetChanged(profiles, this.lastInstallServers);

  const shouldInspectServers = shouldInspectFleetInstallations({
    forceOfficialCheck,
    serversMode,
    officialChanged,
    serverSetChanged,
  });

  const servers = shouldInspectServers
    ? await this.inspectFleetInstallations({
        bypassCache: forceOfficialCheck,
      })
    : this.lastInstallServers;

  this.lastOfficialVersion = officialVersion;
  this.lastOfficialSteamBuild = officialSteamBuild;
  if (shouldInspectServers) {
    this.lastInstallServers = servers;
  }

  return {
    officialVersion,
    officialNetworkStatus,
    officialSteamBuild,
    servers,
  };
}

/**
 * Bounded, async fleet inspect so many profiles (and slow UNC paths) do not
 * freeze the Electron main process. Concurrent callers share one in-flight
 * promise when the profile-set key and cache mode match; after waiting for a
 * different key they re-check before starting another scan.
 */
async inspectFleetInstallations(options: {
  bypassCache: boolean;
}): Promise<ServerInstallationInfo[]> {
  for (;;) {
    const profiles = this.deps.repo.list();
    const key = buildFleetInspectKey(profiles, options.bypassCache);
    const existing = this.fleetInspectInFlight;
    if (existing !== null && existing.key === key) {
      return existing.promise;
    }
    if (existing !== null) {
      // Different fleet snapshot or cache mode — wait, then re-evaluate.
      await existing.promise.catch(() => undefined);
      continue;
    }

    // No in-flight work. Capture the latest list and start (sync section — safe).
    const profilesToScan = this.deps.repo.list();
    const scanKey = buildFleetInspectKey(profilesToScan, options.bypassCache);
    const promise = this.runFleetInstallScan(profilesToScan, options.bypassCache).finally(
      () => {
        if (this.fleetInspectInFlight?.promise === promise) {
          this.fleetInspectInFlight = null;
        }
      },
    );
    this.fleetInspectInFlight = { key: scanKey, promise };
    return promise;
  }
}

async runFleetInstallScan(
  profilesToScan: ReadonlyArray<ServerProfile>,
  bypassCache: boolean,
): Promise<ServerInstallationInfo[]> {
  return mapPool(profilesToScan, FLEET_INSPECT_CONCURRENCY, async (profile) => {
    // Fleet starts FS/manifest-only; only no-display-version installs get a
    // follow-up log probe (and optional exe probe on forced refresh).
    let info = await inspectServerInstallationAsync(profile.id, profile.installDir, {
      bypassCache,
    });
    // When the cheap pass has no ARK-style display version, enrich with log
    // (and optionally exe) probes. Do not treat Steam buildids as display versions.
    if (
      info.health === "ready" &&
      resolveDisplayedServerVersion(info) == null
    ) {
      info = await inspectServerInstallationAsync(profile.id, profile.installDir, {
        bypassCache: true,
        allowLogVersionProbe: true,
        allowExecutableVersionProbe: bypassCache,
      });
    }
    this.recordInstallHealth(info);
    return info;
  });
}

/** Update health memory and emit degradation-only events. */
recordInstallHealth(info: ServerInstallationInfo): void {
  const previous = this.lastKnownInstallHealth.get(info.serverId) ?? null;
  this.lastKnownInstallHealth.set(info.serverId, info.health);
  if (!isInstallHealthDegradation(previous, info.health)) {
    return;
  }
  const profile = this.deps.repo.get(info.serverId);
  const name = profile?.name ?? info.serverId;
  this.deps.repo.addEvent(
    info.serverId,
    "installation_health_degraded",
    info.health === "inaccessible" || info.health === "suspicious"
      ? "error"
      : "warning",
    `Install health for "${name}" is ${info.health}`,
    {
      what: `Installation health changed to ${info.health}.`,
      cause: info.reasonCodes.length > 0 ? info.reasonCodes.join(", ") : undefined,
      location: profile?.installDir ?? info.binaryPath,
      suggestion: info.guidance,
      context: {
        health: info.health,
        reasonCodes: info.reasonCodes.join(","),
        previousHealth: previous,
      },
    },
  );
}
}
