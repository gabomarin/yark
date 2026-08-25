import { describe, expect, it } from "vitest";
import {
  buildWindowsProcessResourcesCommand,
  cpuPercentFromDeltas,
} from "../../src/backend/infra/process/windows-process-sample";

describe("cpuPercentFromDeltas", () => {
  it("returns null for the first / too-short wall interval", () => {
    expect(
      cpuPercentFromDeltas({
        prevCpuSeconds: 1,
        nextCpuSeconds: 1.1,
        prevAtMs: 1_000,
        nextAtMs: 1_040,
      }),
    ).toBeNull();
  });

  it("computes % of one logical processor from CPU-second deltas", () => {
    expect(
      cpuPercentFromDeltas({
        prevCpuSeconds: 10,
        nextCpuSeconds: 12,
        prevAtMs: 0,
        nextAtMs: 4_000,
      }),
    ).toBe(50);
  });

  it("returns null when CPU time goes backwards", () => {
    expect(
      cpuPercentFromDeltas({
        prevCpuSeconds: 10,
        nextCpuSeconds: 9,
        prevAtMs: 0,
        nextAtMs: 4_000,
      }),
    ).toBeNull();
  });
});

describe("buildWindowsProcessResourcesCommand", () => {
  it("joins with newlines so hashtable braces stay valid PowerShell", () => {
    const script = buildWindowsProcessResourcesCommand([42080]);
    expect(script).toContain("$ids = @(42080)");
    expect(script).toContain("[pscustomobject]@{");
    expect(script).not.toMatch(/\{;/);
    expect(script).not.toMatch(/@\{;/);
  });
});
