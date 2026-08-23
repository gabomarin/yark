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

/**
 * Shared refresh state only accepts the latest generation. User actions still
 * receive their completed snapshot so a background poll cannot cancel the UI
 * result, but a stale action never writes over newer shared state.
 */
export function decideRefreshGeneration(
  generation: number,
  gate: { isCurrent: (generation: number) => boolean },
  isAction: boolean,
): { commit: boolean; returnSnapshot: boolean } {
  const commit = gate.isCurrent(generation);
  return {
    commit,
    returnSnapshot: commit || isAction,
  };
}
