/**
 * Synchronous Start/Restart in-flight claim (#390).
 * Updates `busyRef` immediately so a second click in the same tick is rejected
 * before React re-renders.
 */
export function claimStartBusy(
  busyRef: { current: Set<string> },
  id: string,
): boolean {
  if (busyRef.current.has(id)) {
    return false;
  }
  const next = new Set(busyRef.current);
  next.add(id);
  busyRef.current = next;
  return true;
}

export function releaseStartBusy(
  busyRef: { current: Set<string> },
  id: string,
): void {
  if (!busyRef.current.has(id)) {
    return;
  }
  const next = new Set(busyRef.current);
  next.delete(id);
  busyRef.current = next;
}
