const FLIP_THRESHOLD_PX = 1;

export function shouldFlipQueueOrder(
  previousIds: readonly string[],
  nextIds: readonly string[],
): boolean {
  if (previousIds.length < 2 || previousIds.length !== nextIds.length) {
    return false;
  }
  const previous = new Set(previousIds);
  for (const id of nextIds) {
    if (!previous.has(id)) return false;
  }
  return previousIds.some((id, index) => id !== nextIds[index]);
}

export function flipDeltas(
  previous: ReadonlyMap<string, { top: number }>,
  next: ReadonlyMap<string, { top: number }>,
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const [id, box] of next) {
    const prior = previous.get(id);
    if (prior === undefined) continue;
    const dy = prior.top - box.top;
    if (Math.abs(dy) >= FLIP_THRESHOLD_PX) {
      deltas.set(id, dy);
    }
  }
  return deltas;
}
