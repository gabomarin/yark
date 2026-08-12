import { describe, expect, it } from "vitest";
import {
  clusterProcessBusyReason,
  isServerProcessLive,
} from "@shared/server-process-idle";

describe("server-process-idle", () => {
  it("treats transitional statuses as live when processLive is false", () => {
    for (const status of ["starting", "running", "stopping"] as const) {
      expect(isServerProcessLive({ status, processLive: false })).toBe(true);
      expect(clusterProcessBusyReason({ status, processLive: false })).toBe(
        "Server must not be running",
      );
    }
  });

  it("allows idle error when the child has exited", () => {
    expect(isServerProcessLive({ status: "error", processLive: false })).toBe(false);
    expect(clusterProcessBusyReason({ status: "error", processLive: false })).toBeNull();
  });

  it("blocks error when the child is still live", () => {
    expect(isServerProcessLive({ status: "error", processLive: true })).toBe(true);
    expect(clusterProcessBusyReason({ status: "error", processLive: true })).toBe(
      "Server must not be running",
    );
  });

  it("allows stopped servers", () => {
    expect(isServerProcessLive({ status: "stopped", processLive: false })).toBe(false);
    expect(clusterProcessBusyReason({ status: "stopped", processLive: false })).toBeNull();
  });
});
