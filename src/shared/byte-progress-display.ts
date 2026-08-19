/** Skip the byte subline when the phase label already carries the same numbers. */
export function byteProgressLineIsRedundant(
  shortProgressLabel: string,
  byteProgressLabel: string | null,
): boolean {
  if (byteProgressLabel === null) {
    return true;
  }
  const short = shortProgressLabel.replace(/\s+/g, " ").trim();
  return short.includes(byteProgressLabel.replace(/\s+/g, " ").trim());
}
