import { describe, expect, it } from "vitest";
import {
  createGenerationGate,
  decideRefreshGeneration,
} from "../../src/shared/createGenerationGate";

describe("createGenerationGate", () => {
  it("treats only the latest begin() generation as current", () => {
    const gate = createGenerationGate();
    const first = gate.begin();
    expect(gate.isCurrent(first)).toBe(true);
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    expect(gate.current()).toBe(second);
  });
});

describe("decideRefreshGeneration", () => {
  it("returns a stale action snapshot without committing it", () => {
    const gate = createGenerationGate();
    const action = gate.begin();
    gate.begin();
    expect(decideRefreshGeneration(action, gate, true)).toEqual({
      commit: false,
      returnSnapshot: true,
    });
  });

  it("commits and returns only the latest poll generation", () => {
    const gate = createGenerationGate();
    const first = gate.begin();
    expect(decideRefreshGeneration(first, gate, false)).toEqual({
      commit: true,
      returnSnapshot: true,
    });
    const second = gate.begin();
    expect(decideRefreshGeneration(first, gate, false)).toEqual({
      commit: false,
      returnSnapshot: false,
    });
    expect(decideRefreshGeneration(second, gate, false)).toEqual({
      commit: true,
      returnSnapshot: true,
    });
  });
});
