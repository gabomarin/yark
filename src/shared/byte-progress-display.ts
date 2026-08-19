function normalizeProgressLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Skip the byte subline when the phase label already carries the same numbers. */
export function byteProgressLineIsRedundant(
  shortProgressLabel: string,
  byteProgressLabel: string | null,
): boolean {
  if (byteProgressLabel === null) {
    return true;
  }
  const short = normalizeProgressLabel(shortProgressLabel);
  const bytes = normalizeProgressLabel(byteProgressLabel);
  if (bytes.length === 0) {
    return true;
  }
  const pattern = new RegExp(`(?:^|[\\s·])${escapeRegExp(bytes)}(?:$|[\\s·])`);
  return pattern.test(short);
}
