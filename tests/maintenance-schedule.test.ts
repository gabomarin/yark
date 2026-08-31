import { describe, expect, it } from "vitest";
import { defaultMaintenancePolicy } from "@shared/maintenance-policy";
import {
  formatWarningTimePhrase,
  maxWarningLeadMs,
  nextLocalRestartAt,
  parseMaintenanceOffsetToMs,
  renderLastMinuteRestart,
  renderLastMinuteUpdate,
  renderWarningTemplate,
  resolveWarningOffsetLabels,
  shouldUseLastMinuteChat,
} from "../src/shared/maintenance-schedule";
import { MAINTENANCE_RESTART_PRESET_OFFSETS } from "../src/shared/maintenance-policy";
import {
  formatRestartDaysSummary,
  normalizeRestartDaysOfWeek,
} from "../src/shared/maintenance-restart-days";

describe("maintenance-schedule", () => {
  it("parses offset labels", () => {
    expect(parseMaintenanceOffsetToMs("30m")).toBe(30 * 60_000);
    expect(parseMaintenanceOffsetToMs("10s")).toBe(10_000);
    expect(parseMaintenanceOffsetToMs("nope")).toBeNull();
  });

  it("computes next local restart on selected days", () => {
    // Wednesday 2026-09-02 12:00 local — every day → Thursday 04:00
    const from = new Date(2026, 8, 2, 12, 0, 0, 0).getTime();
    const next = nextLocalRestartAt([0, 1, 2, 3, 4, 5, 6], "04:00", from);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(4);
    expect(next!.getDate()).toBe(3);
  });

  it("computes next restart for Mon + Fri only", () => {
    // Wednesday 2026-09-02 12:00 → next Friday 04:00
    const from = new Date(2026, 8, 2, 12, 0, 0, 0).getTime();
    const next = nextLocalRestartAt([1, 5], "04:00", from);
    expect(next).not.toBeNull();
    expect(next!.getDay()).toBe(5);
    expect(next!.getDate()).toBe(4);
  });

  it("formats restart day summaries", () => {
    expect(formatRestartDaysSummary([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(formatRestartDaysSummary([1, 5])).toBe("Mon & Fri");
    expect(normalizeRestartDaysOfWeek([])).toEqual([0]);
  });

  it("last-minute chat gate", () => {
    const standard = defaultMaintenancePolicy("s1", "t").restartWarnings;
    const off = { ...standard, preset: "none" as const, customOffsets: [] };
    expect(shouldUseLastMinuteChat(30_000, off, "schedule")).toBe(false);
    expect(
      shouldUseLastMinuteChat(
        30_000,
        { ...standard, lastMinuteChat: false },
        "schedule",
      ),
    ).toBe(false);
    expect(shouldUseLastMinuteChat(30_000, standard, "schedule")).toBe(true);
    expect(shouldUseLastMinuteChat(30_000, off, "run_now")).toBe(true);
  });

  it("resolves none preset to no offsets", () => {
    const warnings = {
      ...defaultMaintenancePolicy("s1", "t").restartWarnings,
      preset: "none" as const,
      customOffsets: [],
    };
    expect(
      resolveWarningOffsetLabels(warnings, MAINTENANCE_RESTART_PRESET_OFFSETS),
    ).toEqual([]);
    expect(maxWarningLeadMs([])).toBe(0);
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
