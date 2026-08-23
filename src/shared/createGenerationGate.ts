/**
 * Monotonic generation gate for async loads / polls (#209).
 * Call `begin()` when starting work; ignore results when `isCurrent` is false.
 */
export function createGenerationGate(): {
  begin: () => number;
  isCurrent: (generation: number) => boolean;
  current: () => number;
} {
  let generation = 0;
  return {
    begin: () => {
      generation += 1;
      return generation;
    },
    isCurrent: (value: number) => value === generation,
    current: () => generation,
  };
}

/** Poll refreshes use a generation; user actions pass `null` and always commit. */
export function isRefreshGenerationCurrent(
  generation: number | null,
  gate: { isCurrent: (generation: number) => boolean },
): boolean {
  return generation === null || gate.isCurrent(generation);
}
