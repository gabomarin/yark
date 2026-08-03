import { PORT_MAX, PORT_MIN, type SessionPortSet } from "./types";

/** Thrown when a host bind probe confirms the port is in use. */
export const HOST_PORT_BUSY_PREFIX = "HOST_PORT_BUSY:";

/**
 * Thrown when the OS probe cannot confirm free/busy for configured ports.
 * Start on those ports is still blocked; recovery is a confirmed-free session set.
 */
export const HOST_PORT_INCONCLUSIVE_PREFIX = "HOST_PORT_PROBE_INCONCLUSIVE:";

export type { SessionPortSet };

const SUGGESTED_RE =
  /\bsuggested=game:(\d+),query:(\d+),rcon:(\d+)\b/;

export function encodeSuggestedSessionPorts(ports: SessionPortSet): string {
  return `suggested=game:${ports.gamePort},query:${ports.queryPort},rcon:${ports.rconPort}`;
}

export function parseSuggestedSessionPorts(
  message: string,
): SessionPortSet | null {
  const match = SUGGESTED_RE.exec(message);
  if (match === null) {
    return null;
  }
  const gamePort = Number(match[1]);
  const queryPort = Number(match[2]);
  const rconPort = Number(match[3]);
  if (
    !Number.isInteger(gamePort) ||
    !Number.isInteger(queryPort) ||
    !Number.isInteger(rconPort) ||
    gamePort < PORT_MIN ||
    gamePort > PORT_MAX ||
    queryPort < PORT_MIN ||
    queryPort > PORT_MAX ||
    rconPort < PORT_MIN ||
    rconPort > PORT_MAX ||
    gamePort === queryPort ||
    gamePort === rconPort ||
    queryPort === rconPort
  ) {
    return null;
  }
  return { gamePort, queryPort, rconPort };
}

export function isHostPortBusyError(message: string): boolean {
  return message.startsWith(HOST_PORT_BUSY_PREFIX);
}

export function isInconclusiveHostPortProbeError(message: string): boolean {
  return message.startsWith(HOST_PORT_INCONCLUSIVE_PREFIX);
}

export function isHostPortProbeError(message: string): boolean {
  return isHostPortBusyError(message) || isInconclusiveHostPortProbeError(message);
}

export function formatHostPortBusyError(
  detail: string,
  suggested?: SessionPortSet | null,
): string {
  return joinProbeError(HOST_PORT_BUSY_PREFIX, detail, suggested);
}

export function formatHostPortInconclusiveError(
  detail: string,
  suggested?: SessionPortSet | null,
): string {
  return joinProbeError(HOST_PORT_INCONCLUSIVE_PREFIX, detail, suggested);
}

/** Strip machine prefix and suggested trailer for operator-facing copy. */
export function humanizeHostPortProbeError(message: string): string {
  return message
    .replace(HOST_PORT_BUSY_PREFIX, "")
    .replace(HOST_PORT_INCONCLUSIVE_PREFIX, "")
    .replace(SUGGESTED_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function joinProbeError(
  prefix: string,
  detail: string,
  suggested?: SessionPortSet | null,
): string {
  const trimmed = detail.trim();
  if (suggested == null) {
    return `${prefix} ${trimmed}`;
  }
  return `${prefix} ${trimmed} ${encodeSuggestedSessionPorts(suggested)}`;
}
