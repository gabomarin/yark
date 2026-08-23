import { get } from "node:https";
import type { OfficialNetworkStatus } from "@shared/types";
import { ASA_APP_ID } from "./install-steam-build";

const OFFICIAL_VERSION_TTL_MS = 15 * 60 * 1000;
const OFFICIAL_SERVER_STATUS_URL =
  "https://cdn2.arkdedicated.com/asa/officialserverstatus.ini";

export interface OfficialArkVersionProbe {
  version: string | null;
  networkStatus: OfficialNetworkStatus;
}

const officialVersionCache: {
  value: string | null;
  networkStatus: OfficialNetworkStatus;
  checkedAt: number;
  inFlight: Promise<OfficialArkVersionProbe> | null;
} = {
  value: null,
  networkStatus: "unknown",
  checkedAt: 0,
  inFlight: null,
};

const officialBuildCache: {
  value: string | null;
  checkedAt: number;
  inFlight: Promise<string | null> | null;
} = {
  value: null,
  checkedAt: 0,
  inFlight: null,
};

function readPathValue(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function normalizeBuildId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${Math.trunc(value)}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function extractOfficialBuildFromPayload(payload: unknown): string | null {
  const appNode =
    readPathValue(payload, ["data", ASA_APP_ID]) ??
    readPathValue(payload, [ASA_APP_ID]) ??
    readPathValue(payload, ["response", ASA_APP_ID]);

  const candidates = [
    readPathValue(appNode, ["depots", "branches", "public", "buildid"]),
    readPathValue(appNode, ["depots", "branches", "public", "BuildID"]),
    readPathValue(appNode, ["common", "buildid"]),
    readPathValue(appNode, ["buildid"]),
  ];

  for (const candidate of candidates) {
    const buildId = normalizeBuildId(candidate);
    if (buildId !== null) {
      return `build ${buildId}`;
    }
  }

  return null;
}

function fetchOfficialArkBuild(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = get("https://api.steamcmd.net/v1/info/2430930", (res) => {
      if ((res.statusCode ?? 500) >= 400) {
        resolve(null);
        res.resume();
        return;
      }

      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body) as unknown;
          resolve(extractOfficialBuildFromPayload(parsed));
        } catch {
          resolve(null);
        }
      });
    });

    req.setTimeout(3_500, () => {
      req.destroy();
      resolve(null);
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}

export function extractOfficialVersionFromStatusText(content: string): string | null {
  return parseOfficialServerStatus(content).version;
}

export function parseOfficialServerStatus(content: string): OfficialArkVersionProbe {
  const versionMatch = content.match(/\(\s*v(\d+(?:\.\d+)+)\s*\)/i);
  const version = versionMatch?.[1] ?? null;

  const statusMatch =
    content.match(/>\s*(Online|Deploying|Offline|Healthy)\b/i) ??
    content.match(/\b(Online|Deploying|Offline|Healthy)\b/i);
  const rawStatus = statusMatch?.[1]?.toLowerCase() ?? "";

  let networkStatus: OfficialNetworkStatus = "unknown";
  if (rawStatus === "online" || rawStatus === "healthy") {
    networkStatus = "online";
  } else if (rawStatus === "deploying") {
    networkStatus = "deploying";
  } else if (rawStatus === "offline") {
    networkStatus = "offline";
  }

  return { version, networkStatus };
}

function fetchOfficialArkVersion(): Promise<OfficialArkVersionProbe> {
  return new Promise((resolve) => {
    const req = get(
      OFFICIAL_SERVER_STATUS_URL,
      {
        headers: {
          accept: "text/plain, */*",
          "user-agent": "yark-server-manager/1.0",
        },
      },
      (res) => {
        if ((res.statusCode ?? 500) >= 400) {
          resolve({ version: null, networkStatus: "unknown" });
          res.resume();
          return;
        }

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve(parseOfficialServerStatus(body));
        });
      },
    );

    req.setTimeout(3_500, () => {
      req.destroy();
      resolve({ version: null, networkStatus: "unknown" });
    });

    req.on("error", () => {
      resolve({ version: null, networkStatus: "unknown" });
    });
  });
}

/**
 * Cached Wildcard official-network probe (`officialserverstatus.ini`).
 * - Success: cached for `OFFICIAL_VERSION_TTL_MS` (~15m) unless `force`.
 * - Concurrent callers share one in-flight request.
 * - Failed probe: keep last success when available; otherwise shorten TTL (~30s)
 *   so the next poll can retry without waiting the full window.
 */
export async function readOfficialArkVersionCached(
  force = false,
): Promise<OfficialArkVersionProbe> {
  const now = Date.now();
  if (!force && now - officialVersionCache.checkedAt < OFFICIAL_VERSION_TTL_MS) {
    return {
      version: officialVersionCache.value,
      networkStatus: officialVersionCache.networkStatus,
    };
  }

  if (officialVersionCache.inFlight !== null) {
    return officialVersionCache.inFlight;
  }

  officialVersionCache.inFlight = fetchOfficialArkVersion()
    .then((probe) => {
      if (probe.version !== null) {
        officialVersionCache.value = probe.version;
        officialVersionCache.networkStatus = probe.networkStatus;
        officialVersionCache.checkedAt = Date.now();
        return probe;
      }
      // Do not lock a failed probe for the full TTL — retry soon, keep last success.
      if (officialVersionCache.value === null) {
        officialVersionCache.checkedAt =
          Date.now() - OFFICIAL_VERSION_TTL_MS + 30_000;
        officialVersionCache.networkStatus = probe.networkStatus;
      }
      return {
        version: officialVersionCache.value,
        networkStatus:
          officialVersionCache.value !== null
            ? officialVersionCache.networkStatus
            : probe.networkStatus,
      };
    })
    .finally(() => {
      officialVersionCache.inFlight = null;
    });

  return officialVersionCache.inFlight;
}

export async function readOfficialArkBuildCached(force = false): Promise<string | null> {
  const now = Date.now();
  if (!force && now - officialBuildCache.checkedAt < OFFICIAL_VERSION_TTL_MS) {
    return officialBuildCache.value;
  }

  if (officialBuildCache.inFlight !== null) {
    return officialBuildCache.inFlight;
  }

  officialBuildCache.inFlight = fetchOfficialArkBuild()
    .then((value) => {
      officialBuildCache.value = value;
      officialBuildCache.checkedAt = Date.now();
      return value;
    })
    .finally(() => {
      officialBuildCache.inFlight = null;
    });

  return officialBuildCache.inFlight;
}
