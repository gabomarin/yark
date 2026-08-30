import { describe, expect, it } from "vitest";
import {
  formatWarningTimePhrase,
  maxWarningLeadMs,
  nextLocalRestartAt,
  parseMaintenanceOffsetToMs,
  renderLastMinuteRestart,
  renderLastMinuteUpdate,
  renderWarningTemplate,
} from "../src/shared/maintenance-schedule";

describe("maintenance-schedule", () => {
  it("parses offset labels", () => {
    expect(parseMaintenanceOffsetToMs("30m")).toBe(30 * 60_000);
    expect(parseMaintenanceOffsetToMs("10s")).toBe(10_000);
    expect(parseMaintenanceOffsetToMs("nope")).toBeNull();
  });

  it("computes next daily local restart", () => {
    // Wednesday 2026-09-02 12:00 local
    const from = new Date(2026, 8, 2, 12, 0, 0, 0).getTime();
    const next = nextLocalRestartAt("daily", 0, "04:00", from);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(4);
    expect(next!.getDate()).toBe(3);
  });

  it("computes next weekly local restart", () => {
    // Wednesday 2026-09-02 12:00 → next Sunday 04:00
    const from = new Date(2026, 8, 2, 12, 0, 0, 0).getTime();
    const next = nextLocalRestartAt("weekly", 0, "04:00", from);
    expect(next).not.toBeNull();
    expect(next!.getDay()).toBe(0);
    expect(next!.getHours()).toBe(4);
    expect(next!.getDate()).toBe(6);
  });

  it("formats template phrases and last-minute copy", () => {
    expect(formatWarningTimePhrase(15 * 60_000)).toBe("15 minutes");
    expect(renderWarningTemplate("Server restart in {time}", 60_000)).toBe(
      "Server restart in 1 minute",
    );
    expect(renderLastMinuteRestart(9.2)).toBe("Restart in 10s");
    expect(renderLastMinuteUpdate(9.2)).toBe("Update in 10s");
    expect(maxWarningLeadMs(["5m", "30m"])).toBe(30 * 60_000);
  });
});
