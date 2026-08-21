import { describe, expect, it } from "vitest";
import {
  OS_NOTIFY_CRASH_COOLDOWN_MS,
  OS_NOTIFY_CRASH_EVENT_TYPE,
  OS_NOTIFY_STEAMCMD_EVENT_TYPES,
  OS_NOTIFY_STEAMCMD_JOB_COOLDOWN_MS,
  isYarkE2eUserDataEnv,
  shouldNotifySteamCmdJobEvent,
  shouldShowFleetOsNotification,
  shouldSkipNativeNotification,
  truncateToastBody,
} from "@shared/os-notification-events";

const prefsOn = {
  osNotifyEnabled: true,
  osNotifyCrash: true,
  osNotifySteamCmd: true,
};

describe("os-notification policy (#331)", () => {
  it("skips native toasts in E2E and when unsupported", () => {
    expect(isYarkE2eUserDataEnv({ YARK_E2E_USER_DATA: "C:\\tmp\\e2e" })).toBe(
      true,
    );
    expect(isYarkE2eUserDataEnv({ YARK_E2E_USER_DATA: "  " })).toBe(false);
    expect(shouldSkipNativeNotification({ isSupported: true, isE2e: true })).toBe(
      true,
    );
    expect(
      shouldSkipNativeNotification({ isSupported: false, isE2e: false }),
    ).toBe(true);
    expect(
      shouldSkipNativeNotification({ isSupported: true, isE2e: false }),
    ).toBe(false);
  });

  it("skips when the master switch or category is off", () => {
    expect(
      shouldShowFleetOsNotification({
        category: "crash",
        prefs: { ...prefsOn, osNotifyEnabled: false },
        windowFocusedVisible: false,
        nowMs: 1_000,
        lastShownAtMs: undefined,
        cooldownMs: OS_NOTIFY_CRASH_COOLDOWN_MS,
      }),
    ).toBe(false);
    expect(
      shouldShowFleetOsNotification({
        category: "crash",
        prefs: { ...prefsOn, osNotifyCrash: false },
        windowFocusedVisible: false,
        nowMs: 1_000,
        lastShownAtMs: undefined,
        cooldownMs: OS_NOTIFY_CRASH_COOLDOWN_MS,
      }),
    ).toBe(false);
    expect(
      shouldShowFleetOsNotification({
        category: "steamcmd",
        prefs: { ...prefsOn, osNotifySteamCmd: false },
        windowFocusedVisible: false,
        nowMs: 1_000,
        lastShownAtMs: undefined,
        cooldownMs: OS_NOTIFY_STEAMCMD_JOB_COOLDOWN_MS,
      }),
    ).toBe(false);
  });

  it("skips when the main window is focused and visible", () => {
    expect(
      shouldShowFleetOsNotification({
        category: "crash",
        prefs: prefsOn,
        windowFocusedVisible: true,
        nowMs: 1_000,
        lastShownAtMs: undefined,
        cooldownMs: OS_NOTIFY_CRASH_COOLDOWN_MS,
      }),
    ).toBe(false);
    expect(
      shouldShowFleetOsNotification({
        category: "steamcmd",
        prefs: prefsOn,
        windowFocusedVisible: true,
        nowMs: 1_000,
        lastShownAtMs: undefined,
        cooldownMs: OS_NOTIFY_STEAMCMD_JOB_COOLDOWN_MS,
      }),
    ).toBe(false);
  });

  it("shows crash toasts when unfocused, then cools down flap-crashes", () => {
    expect(
      shouldShowFleetOsNotification({
        category: "crash",
        prefs: prefsOn,
        windowFocusedVisible: false,
        nowMs: 10_000,
        lastShownAtMs: undefined,
        cooldownMs: OS_NOTIFY_CRASH_COOLDOWN_MS,
      }),
    ).toBe(true);
    expect(
      shouldShowFleetOsNotification({
        category: "crash",
        prefs: prefsOn,
        windowFocusedVisible: false,
        nowMs: 10_000 + OS_NOTIFY_CRASH_COOLDOWN_MS - 1,
        lastShownAtMs: 10_000,
        cooldownMs: OS_NOTIFY_CRASH_COOLDOWN_MS,
      }),
    ).toBe(false);
    expect(
      shouldShowFleetOsNotification({
        category: "crash",
        prefs: prefsOn,
        windowFocusedVisible: false,
        nowMs: 10_000 + OS_NOTIFY_CRASH_COOLDOWN_MS,
        lastShownAtMs: 10_000,
        cooldownMs: OS_NOTIFY_CRASH_COOLDOWN_MS,
      }),
    ).toBe(true);
  });

  it("notifies completed, failed, and rolled-back jobs but not retries or start", () => {
    expect(OS_NOTIFY_CRASH_EVENT_TYPE).toBe("server_crashed");
    expect([...OS_NOTIFY_STEAMCMD_EVENT_TYPES]).toEqual([
      "update_completed",
      "update_failed",
      "update_rolled_back",
    ]);
    expect(shouldNotifySteamCmdJobEvent("update_started", "info")).toBe(false);
    expect(shouldNotifySteamCmdJobEvent("update_completed", "info")).toBe(true);
    expect(shouldNotifySteamCmdJobEvent("update_failed", "error")).toBe(true);
    expect(shouldNotifySteamCmdJobEvent("update_failed", "warning")).toBe(false);
    expect(shouldNotifySteamCmdJobEvent("update_rolled_back", "warning")).toBe(
      true,
    );
    expect(shouldNotifySteamCmdJobEvent("server_crashed", "error")).toBe(false);
  });

  it("truncates long toast bodies", () => {
    expect(truncateToastBody("short")).toBe("short");
    expect(truncateToastBody("x".repeat(181)).endsWith("…")).toBe(true);
    expect(truncateToastBody("x".repeat(181)).length).toBe(180);
  });
});
