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
