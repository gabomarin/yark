import { describe, expect, it } from "vitest";
import {
  appendRuntimeLogRing,
  hasReadyLogLine,
  shouldDelayRconProbe,
  splitRuntimeLogChunk,
} from "@backend/infra/process/process-readiness";

describe("process-readiness helpers", () => {
  it("detects ready log lines", () => {
    expect(
      hasReadyLogLine(["[system] Server has completed startup"]),
    ).toBe(true);
    expect(hasReadyLogLine(["still booting"])).toBe(false);
  });

  it("delays RCON probes until min wait or log signal", () => {
    expect(
      shouldDelayRconProbe({
        sawLogSignal: false,
        elapsedMs: 1000,
        minWaitMs: 5000,
      }),
    ).toBe(true);
    expect(
      shouldDelayRconProbe({
        sawLogSignal: true,
        elapsedMs: 1000,
        minWaitMs: 5000,
      }),
    ).toBe(false);
  });

  it("splits runtime log chunks and trims ring buffer", () => {
    expect(splitRuntimeLogChunk("", "line1\npartial")).toEqual({
      completeLines: ["line1"],
      remainder: "partial",
    });
    const ring = appendRuntimeLogRing(["a"], "b", 2);
    expect(ring).toEqual(["a", "b"]);
  });
});
