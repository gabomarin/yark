import { describe, expect, it } from "vitest";
import { byteProgressLineIsRedundant } from "../src/shared/byte-progress-display";

describe("byteProgressLineIsRedundant", () => {
  it("hides the byte subline when the phase label already includes the same range", () => {
    expect(
      byteProgressLineIsRedundant(
        "Verifying · 6909.1 / 12244.2 MB",
        "6909.1 / 12244.2 MB",
      ),
    ).toBe(true);
  });

  it("keeps the byte subline when the phase label is only a verb", () => {
    expect(byteProgressLineIsRedundant("Verifying", "6909.1 / 12244.2 MB")).toBe(false);
  });
});
