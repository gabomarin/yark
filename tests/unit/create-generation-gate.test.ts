import { describe, expect, it } from "vitest";
import { createGenerationGate } from "../../src/shared/createGenerationGate";

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
