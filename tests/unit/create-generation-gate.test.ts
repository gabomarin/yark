import { describe, expect, it } from "vitest";
import {
  createGenerationGate,
  isRefreshGenerationCurrent,
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

describe("isRefreshGenerationCurrent", () => {
  it("always commits action refreshes that skip the poll generation gate", () => {
    const gate = createGenerationGate();
    gate.begin();
    expect(isRefreshGenerationCurrent(null, gate)).toBe(true);
  });

  it("commits only the latest poll generation", () => {
    const gate = createGenerationGate();
    const first = gate.begin();
    expect(isRefreshGenerationCurrent(first, gate)).toBe(true);
    gate.begin();
    expect(isRefreshGenerationCurrent(first, gate)).toBe(false);
  });
});
