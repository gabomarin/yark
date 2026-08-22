import { describe, expect, it, vi } from "vitest";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";

describe("runWithFinally", () => {
  it("returns the fn result and always runs cleanup", async () => {
    const cleanup = vi.fn();
    await expect(
      runWithFinally(async () => 42, cleanup),
    ).resolves.toBe(42);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("runs cleanup when fn throws", async () => {
    const cleanup = vi.fn();
    await expect(
      runWithFinally(async () => {
        throw new Error("boom");
      }, cleanup),
    ).rejects.toThrow("boom");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
