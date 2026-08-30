import { describe, expect, it } from "vitest";
import { defaultMaintenancePolicy } from "@shared/maintenance-policy";
import {
  anyJobArmed,
  formatRestartSummary,
  previewWarningMessage,
  warningsForPreset,
} from "./model/maintenancePanelModel";

describe("maintenancePanelModel", () => {
  it("formats weekly restart summary", () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      restartEnabled: true,
      schedulePaused: false,
    };
    expect(formatRestartSummary(policy)).toBe(
      "Sunday 04:00 · Standard warnings",
    );
  });

  it("anyJobArmed is false when all off", () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      schedulePaused: false,
    };
    expect(anyJobArmed(policy)).toBe(false);
  });

  it("applies restart quiet preset offsets", () => {
    const base = defaultMaintenancePolicy("s1", "t").restartWarnings;
    const next = warningsForPreset("restart", "quiet", base);
    expect(next.preset).toBe("quiet");
    expect(next.customOffsets).toEqual(["5m"]);
  });

  it("previews warning template", () => {
    expect(previewWarningMessage("Server restart in {time}", "15 minutes")).toBe(
      "Server restart in 15 minutes",
    );
  });
});
