/**
 * Join-info copy payloads (#505). Pure builders so the payload is testable and
 * never carries a `steam://` deep link — ASA dedicated has no reliable one, so
 * the copyable action is the in-game console command `open IP:PORT`.
 */

import { isIpv4Address } from "@shared/net/ip-address";

export interface JoinInfoInput {
  sessionName: string;
  gamePort: number;
  queryPort: number;
  serverPassword: string | null;
}

export function normalizeJoinHost(host: string): string {
  return host.trim();
}

/** True when the host is a usable IPv4 address for the `open` command. */
export function isJoinHostUsable(host: string): boolean {
  return isIpv4Address(normalizeJoinHost(host));
}

/**
 * `open IP:gamePort` — the ASA console command a friend pastes in-game.
 * Returns `null` until a valid IPv4 host is available (hostnames do not work).
 */
export function buildOpenCommand(host: string, gamePort: number): string | null {
  const ip = normalizeJoinHost(host);
  if (!isIpv4Address(ip)) return null;
  return `open ${ip}:${gamePort}`;
}

export function hasJoinPassword(serverPassword: string | null): boolean {
  return (serverPassword?.trim() ?? "").length > 0;
}

/** Masked password for on-screen display; empty when none is set. */
export function maskJoinPassword(serverPassword: string | null): string {
  const password = serverPassword?.trim() ?? "";
  return password.length > 0 ? "•".repeat(8) : "";
}

export function getPublicIpStatusText(
  state: "idle" | "loading" | "detected" | "failed",
  hasIp: boolean,
  hostInvalid: boolean,
): string {
  if (state === "loading") return "Checking this PC’s public IP…";
  if (state === "failed") {
    return hasIp
      ? "Couldn’t refresh the public IP. The current address is still shown."
      : "Couldn’t detect this PC’s public IP. Use refresh to try again.";
  }
  if (hostInvalid) return "The detected address is not a valid IPv4 address. Refresh to try again.";
  if (state === "detected") return "Detected from this PC. Use refresh to check again.";
  return hasIp
    ? "Using the current address. Refresh to check it again."
    : "No public IP detected yet. Use refresh to try again.";
}

export interface JoinInfoFieldCopies {
  sessionName: string;
  gamePort: string;
  queryPort: string;
  /** Raw password for the explicit password-copy action; empty when unset. */
  password: string;
}

/** Single-field copy values (the password is only ever copied on its own button). */
export function buildJoinFieldCopies(input: JoinInfoInput): JoinInfoFieldCopies {
  return {
    sessionName: input.sessionName,
    gamePort: String(input.gamePort),
    queryPort: String(input.queryPort),
    password: input.serverPassword?.trim() ?? "",
  };
}
