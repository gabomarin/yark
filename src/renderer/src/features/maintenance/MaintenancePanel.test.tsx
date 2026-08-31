import { describe, expect, it } from "vitest";
import { defaultMaintenancePolicy } from "@shared/maintenance-policy";
import {
  anyJobArmed,
  formatRestartSummary,
  formatRestartUpNextSubtitle,
  formatUpdateSummary,
  formatMaintenanceLocalDateTime,
  formatMaintenancePresetHint,
  maintenancePolicyWriteFromStatus,
  maintenanceRunRestartNowGate,
  previewWarningMessage,
  warningsForPreset,
  toggleCustomWarningOffset,
  CUSTOM_OFFSET_OPTIONS,
} from "./model/maintenancePanelModel";
import type { MaintenancePolicyStatus } from "@shared/types";

function status(
  partial: Partial<MaintenancePolicyStatus> = {},
): MaintenancePolicyStatus {
  return {
    ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
    schedulePaused: false,
    nextRestartAt: null,
    countdownRemainingMs: null,
    countdownPhase: "idle",
    countdownKind: null,
    lastRestartAt: null,
    lastRestartOk: null,
    lastUpdateAt: null,
    lastUpdateOk: null,
    steamUpdateAvailable: false,
    lastWipeAt: null,
    lastWipeOk: null,
    cancelable: false,
    ...partial,
  };
}

describe("maintenancePanelModel", () => {
  it("formats weekly restart summary", () => {
    expect(formatRestartSummary(status({ restartEnabled: true }))).toBe(
      "Sunday 04:00 · Regular warnings",
    );
    expect(
      formatRestartSummary(
        status({
          restartEnabled: true,
          restartWarnings: {
            ...defaultMaintenancePolicy("s1", "t").restartWarnings,
            preset: "none",
            customOffsets: [],
          },
        }),
      ),
    ).toBe("Sunday 04:00 · No warnings");
  });

  it("formats restart up next subtitle with next run first", () => {
    expect(
      formatRestartUpNextSubtitle(
        status({
          restartEnabled: true,
          nextRestartAt: "2026-08-31T22:29:00.000Z",
        }),
      ),
    ).toMatch(/^Next .+ · Regular warnings before stop$/);
    expect(
      formatRestartUpNextSubtitle(
        status({
          restartEnabled: true,
          nextRestartAt: "2026-08-31T22:29:00.000Z",
          restartWarnings: {
            ...defaultMaintenancePolicy("s1", "t").restartWarnings,
            preset: "none",
            customOffsets: [],
          },
        }),
      ),
    ).toMatch(/^Next .+$/);
    expect(
      formatRestartUpNextSubtitle(
        status({
          restartEnabled: true,
          nextRestartAt: "2026-08-31T22:29:00.000Z",
          restartWarnings: {
            ...defaultMaintenancePolicy("s1", "t").restartWarnings,
            preset: "none",
            customOffsets: [],
          },
        }),
      ),
    ).not.toContain("warnings");
  });

  it("applies none preset for warnings", () => {
    const base = defaultMaintenancePolicy("s1", "t").restartWarnings;
    const next = warningsForPreset("restart", "none", base);
    expect(next.preset).toBe("none");
    expect(next.customOffsets).toEqual([]);
    expect(next.lastMinuteChat).toBe(false);
  });

  it("activates all custom offsets when selecting Custom", () => {
    const base = defaultMaintenancePolicy("s1", "t").restartWarnings;
    const next = warningsForPreset("restart", "custom", base);
    expect(next.preset).toBe("custom");
    expect(next.customOffsets).toEqual([...CUSTOM_OFFSET_OPTIONS]);
  });

  it("falls back to Off when the last custom offset is cleared", () => {
    const base = {
      ...defaultMaintenancePolicy("s1", "t").restartWarnings,
      preset: "custom" as const,
      customOffsets: ["5m"],
    };
    const next = toggleCustomWarningOffset(base, "5m");
    expect(next.preset).toBe("none");
    expect(next.customOffsets).toEqual([]);
    expect(next.lastMinuteChat).toBe(false);
  });

  it("anyJobArmed is false when all off", () => {
    expect(anyJobArmed(status())).toBe(false);
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

  it("formats update summary when enabled", () => {
    expect(formatUpdateSummary(status({ updateEnabled: true }))).toBe(
      "Regular warnings · when a new Ark server version is available",
    );
    expect(
      formatUpdateSummary(
        status({
          updateEnabled: true,
          updateWarnings: {
            ...defaultMaintenancePolicy("s1", "t").updateWarnings,
            preset: "custom",
          },
        }),
      ),
    ).toBe("Your warning times · when a new Ark server version is available");
    expect(formatUpdateSummary(status())).toBe("Off");
  });

  it("policy write omits runtime status fields", () => {
    const write = maintenancePolicyWriteFromStatus(status());
    expect(write).not.toHaveProperty("steamUpdateAvailable");
    expect(write).not.toHaveProperty("nextRestartAt");
    expect(write.restartDaysOfWeek).toEqual([0]);
    expect(write.wipeSaveWorldFirst).toBe(true);
  });

  it("formats maintenance preset hints from offset tables", () => {
    expect(formatMaintenancePresetHint("restart", "quiet")).toBe("5 minutes only");
    expect(formatMaintenancePresetHint("restart", "standard")).toBe(
      "30 minutes · 15 minutes · 5 minutes · 1 minute",
    );
    expect(formatMaintenancePresetHint("update", "standard")).toBe(
      "15 minutes · 5 minutes · 1 minute",
    );
  });

  it("formats maintenance timestamps in 24-hour clock", () => {
    const formatted = formatMaintenanceLocalDateTime("2026-08-31T16:29:00");
    expect(formatted).toContain("16:29");
    expect(formatted).not.toMatch(/a\.?\s*m\.?/i);
  });

  it("run restart now requires a running server", () => {
    expect(
      maintenanceRunRestartNowGate({
        status: "running",
        enabled: true,
        filesJobActive: false,
        installation: { health: "ready" } as never,
      }).allowed,
    ).toBe(true);
    expect(
      maintenanceRunRestartNowGate({
        status: "stopped",
        enabled: true,
        filesJobActive: false,
        installation: { health: "ready" } as never,
      }).allowed,
    ).toBe(false);
    expect(
      maintenanceRunRestartNowGate({
        status: "error",
        enabled: true,
        filesJobActive: false,
        installation: { health: "ready" } as never,
      }).reason,
    ).toContain("crashed");
    expect(
      maintenanceRunRestartNowGate({
        status: "running",
        enabled: true,
        filesJobActive: true,
        installation: { health: "ready" } as never,
      }).allowed,
    ).toBe(false);
  });
});
