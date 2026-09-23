/**
 * True for a dotted-quad IPv4 literal with each octet in 0-255 (#505).
 * ASA's `open` console command needs an IP, not a hostname, so both the
 * public-IP lookup (main) and the join-command builder (renderer) gate on this.
 */
export function isIpv4Address(value: string): boolean {
  const parts = value.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => /^(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])$/.test(part));
}
