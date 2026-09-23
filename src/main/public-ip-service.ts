/**
 * Best-effort public IPv4 lookup for the workspace join-info surface (#505).
 *
 * The renderer CSP blocks outbound fetches, so this runs in the main process.
 * The operator's public IP is sent to a third-party echo service by nature of
 * the lookup; keep the destination fixed and documented in the network-use
 * table (`website/src/content/docs/docs/security-privacy.mdx`).
 */

import { isIpv4Address } from "../shared/net/ip-address";

const PUBLIC_IP_ENDPOINT = "https://api.ipify.org?format=json";
const PUBLIC_IP_TIMEOUT_MS = 4000;
let activeLookup: Promise<string> | null = null;

class PublicIpLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicIpLookupError";
  }
}

/** Returns the detected public IPv4 or throws an operator-facing Error. */
export function lookupPublicIp(): Promise<string> {
  if (activeLookup !== null) return activeLookup;
  const lookup = performPublicIpLookup();
  activeLookup = lookup;
  void lookup
    .finally(() => {
      if (activeLookup === lookup) activeLookup = null;
    })
    .catch(() => undefined);
  return lookup;
}

async function performPublicIpLookup(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_IP_TIMEOUT_MS);
  try {
    const response = await fetch(PUBLIC_IP_ENDPOINT, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new PublicIpLookupError(`Public IP lookup failed (HTTP ${response.status}).`);
    }
    const body: unknown = await response.json();
    const raw = typeof body === "object" && body !== null && "ip" in body ? (body as { ip: unknown }).ip : null;
    const ip = typeof raw === "string" ? raw.trim() : "";
    if (!isIpv4Address(ip)) {
      throw new PublicIpLookupError("Public IP lookup returned an unexpected value.");
    }
    return ip;
  } catch (error) {
    if (error instanceof PublicIpLookupError) throw error;
    if (controller.signal.aborted) {
      throw new PublicIpLookupError("Public IP lookup timed out.");
    }
    throw new Error("Could not detect the public IP. Check the network connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}
