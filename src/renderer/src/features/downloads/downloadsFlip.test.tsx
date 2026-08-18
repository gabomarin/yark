import { describe, expect, it } from "vitest";
import { flipDeltas, shouldFlipQueueOrder } from "./downloadsFlip";

describe("shouldFlipQueueOrder", () => {
  it("is true only when the same ids swap order", () => {
    expect(shouldFlipQueueOrder(["a", "b"], ["b", "a"])).toBe(true);
    expect(shouldFlipQueueOrder(["a", "b", "c"], ["a", "c", "b"])).toBe(true);
  });

  it("is false when the set changes or nothing moved", () => {
    expect(shouldFlipQueueOrder(["a", "b"], ["a", "b"])).toBe(false);
    expect(shouldFlipQueueOrder(["a"], ["a"])).toBe(false);
    expect(shouldFlipQueueOrder(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(shouldFlipQueueOrder(["a", "b"], ["a", "c"])).toBe(false);
    expect(shouldFlipQueueOrder([], ["a", "b"])).toBe(false);
  });
});

describe("flipDeltas", () => {
  it("returns invert distances for rows that changed top", () => {
    const previous = new Map([
      ["a", { top: 10 }],
      ["b", { top: 70 }],
    ]);
    const next = new Map([
      ["a", { top: 70 }],
      ["b", { top: 10 }],
    ]);
    expect(Object.fromEntries(flipDeltas(previous, next))).toEqual({
      a: -60,
      b: 60,
    });
  });

  it("ignores sub-pixel jitter and missing rows", () => {
    const previous = new Map([["a", { top: 10 }]]);
    const next = new Map([
      ["a", { top: 10.4 }],
      ["b", { top: 80 }],
    ]);
    expect(flipDeltas(previous, next).size).toBe(0);
  });
});
