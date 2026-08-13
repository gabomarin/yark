import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOG_RETENTION_SETTINGS,
  assertLogRetentionSettings,
  isFailureEvent,
  isFailureUpdateLogStatus,
  normalizeLogRetentionSettings,
  parseLogRetentionSettings,
} from "@shared/log-retention";

describe("log-retention helpers", () => {
  it("parses missing/invalid JSON as defaults", () => {
    expect(parseLogRetentionSettings(null)).toEqual(DEFAULT_LOG_RETENTION_SETTINGS);
    expect(parseLogRetentionSettings("{")).toEqual(DEFAULT_LOG_RETENTION_SETTINGS);
  });

  it("normalizes and clamps values", () => {
    const next = normalizeLogRetentionSettings({
      eventsRetainDays: 0,
      eventsFailureRetainDays: 10,
      updateLogsRetainCount: 999,
      updateLogsFailureRetainDays: 4000,
      autoCleanupEnabled: false,
    });
    expect(next.eventsRetainDays).toBe(1);
    expect(next.eventsFailureRetainDays).toBe(10);
    expect(next.updateLogsRetainCount).toBe(200);
    expect(next.updateLogsFailureRetainDays).toBe(3650);
    expect(next.autoCleanupEnabled).toBe(false);
  });

  it("rejects invalid operator input", () => {
    expect(() =>
      assertLogRetentionSettings({
        ...DEFAULT_LOG_RETENTION_SETTINGS,
        eventsRetainDays: 0,
      }),
    ).toThrow(/eventsRetainDays/);
    expect(() =>
      assertLogRetentionSettings({
        ...DEFAULT_LOG_RETENTION_SETTINGS,
        eventsRetainDays: 1,
        eventsFailureRetainDays: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertLogRetentionSettings({
        ...DEFAULT_LOG_RETENTION_SETTINGS,
        eventsFailureRetainDays: 30,
        eventsRetainDays: 90,
      }),
    ).toThrow(/eventsFailureRetainDays/);
  });

  it("classifies failure evidence", () => {
    expect(
      isFailureEvent({ type: "server_started", severity: "info" }),
    ).toBe(false);
    expect(
      isFailureEvent({ type: "server_started", severity: "warning" }),
    ).toBe(true);
    expect(
      isFailureEvent({ type: "update_failed", severity: "info" }),
    ).toBe(true);
    expect(isFailureUpdateLogStatus("success")).toBe(false);
    expect(isFailureUpdateLogStatus("failed")).toBe(true);
    expect(isFailureUpdateLogStatus("unknown")).toBe(true);
  });
});
