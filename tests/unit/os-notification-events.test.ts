import { describe, expect, it } from "vitest";
import {
  OS_NOTIFY_CRASH_COOLDOWN_MS,
  OS_NOTIFY_CRASH_EVENT_TYPE,
  OS_NOTIFY_STEAMCMD_EVENT_TYPES,
  formatCrashOsToastBody,
  formatSteamCmdOsToastBody,
  formatYarkUpdateOsToastBody,
  isYarkE2eFullUiEnv,
  isYarkE2eUserDataEnv,
  isYarkE2eShortcutsActive,
  shouldNotifySteamCmdJobEvent,
  shouldShowFleetOsNotification,
  shouldSkipNativeNotification,
  shouldSkipOsToastForFocus,
  steamCmdOsToastSilent,
  truncateToastBody,
  yarkUpdateOsToastDedupeKey,
  yarkUpdateOsToastSilent,
} from "@shared/os-notification-events";

const prefsOn = {
  osNotifyEnabled: true,
  osNotifyCrash: true,
  osNotifySteamCmd: true,
  osNotifyYarkUpdate: true,
};

describe("os-notification policy (#331)", () => {
  it("skips native toasts when E2E shortcuts are active", () => {
    expect(isYarkE2eUserDataEnv({ YARK_E2E_USER_DATA: "C:\\tmp\\e2e" })).toBe(
      true,
    );
    expect(isYarkE2eUserDataEnv({ YARK_E2E_USER_DATA: "  " })).toBe(false);
    expect(
      isYarkE2eFullUiEnv({
        YARK_E2E_FULL_UI: "true",
      }),
    ).toBe(true);
    expect(
      isYarkE2eFullUiEnv({
        YARK_E2E_FULL_UI: "false",
      }),
    ).toBe(false);
    expect(isYarkE2eFullUiEnv({ YARK_E2E_FULL_UI: "yes" })).toBe(true);
    expect(isYarkE2eFullUiEnv({ YARK_E2E_FULL_UI: "" })).toBe(false);
    expect(isYarkE2eFullUiEnv({ YARK_E2E_FULL_UI: "2" })).toBe(false);
    expect(isYarkE2eFullUiEnv({ YARK_E2E_FULL_UI: "truee" })).toBe(false);
    expect(
      isYarkE2eShortcutsActive({ YARK_E2E_USER_DATA: "C:\\tmp\\e2e" }),
    ).toBe(true);
    expect(
      isYarkE2eShortcutsActive({
        YARK_E2E_USER_DATA: "C:\\tmp\\e2e",
        YARK_E2E_FULL_UI: "true",
      }),
    ).toBe(false);
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
        cooldownMs: 0,
      }),
    ).toBe(false);
    expect(
      shouldShowFleetOsNotification({
        category: "yarkUpdate",
        prefs: { ...prefsOn, osNotifyYarkUpdate: false },
        windowFocusedVisible: false,
        nowMs: 1_000,
        lastShownAtMs: undefined,
        cooldownMs: 0,
      }),
    ).toBe(false);
  });

  it("skips crash when focused; SteamCMD only when operator awaited", () => {
    expect(
      shouldSkipOsToastForFocus({
        category: "crash",
        windowFocusedVisible: true,
        operatorAwaited: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipOsToastForFocus({
        category: "yarkUpdate",
        windowFocusedVisible: true,
        operatorAwaited: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipOsToastForFocus({
        category: "steamcmd",
        windowFocusedVisible: true,
        operatorAwaited: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipOsToastForFocus({
        category: "steamcmd",
        windowFocusedVisible: true,
        operatorAwaited: false,
      }),
    ).toBe(false);
    expect(
      shouldShowFleetOsNotification({
        category: "steamcmd",
        prefs: prefsOn,
        windowFocusedVisible: true,
        operatorAwaited: false,
        nowMs: 1_000,
        lastShownAtMs: undefined,
        cooldownMs: 0,
      }),
    ).toBe(true);
    expect(
      shouldShowFleetOsNotification({
        category: "steamcmd",
        prefs: prefsOn,
        windowFocusedVisible: true,
        operatorAwaited: true,
        nowMs: 1_000,
        lastShownAtMs: undefined,
        cooldownMs: 0,
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

  it("blocks a second SteamCMD toast for the same jobId", () => {
    expect(
      shouldShowFleetOsNotification({
        category: "steamcmd",
        prefs: prefsOn,
        windowFocusedVisible: false,
        nowMs: 1_000,
        lastShownAtMs: undefined,
        cooldownMs: 0,
        alreadyNotifiedForJob: true,
      }),
    ).toBe(false);
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

  it("uses Action Center-safe bodies without paths or excerpts", () => {
    expect(formatCrashOsToastBody("Island")).toBe(
      '"Island" exited unexpectedly.',
    );
    expect(formatSteamCmdOsToastBody("update_completed", "Island")).toBe(
      '"Island" SteamCMD job finished.',
    );
    expect(formatSteamCmdOsToastBody("update_failed", "Island")).toBe(
      '"Island" SteamCMD job failed.',
    );
    expect(formatSteamCmdOsToastBody("update_rolled_back", null)).toBe(
      '"Server" update was rolled back.',
    );
    expect(steamCmdOsToastSilent("update_completed")).toBe(true);
    expect(steamCmdOsToastSilent("update_failed")).toBe(false);
    expect(steamCmdOsToastSilent("update_rolled_back")).toBe(false);
    expect(formatYarkUpdateOsToastBody("available", "0.15.0")).toContain("0.15.0");
    expect(formatYarkUpdateOsToastBody("ready", "0.15.0")).toContain("downloaded");
    expect(yarkUpdateOsToastSilent("available")).toBe(true);
    expect(yarkUpdateOsToastSilent("ready")).toBe(false);
    expect(yarkUpdateOsToastDedupeKey("available", "0.15.0")).toBe(
      "available:0.15.0",
    );
  });

  it("truncates long toast bodies", () => {
    expect(truncateToastBody("short")).toBe("short");
    expect(truncateToastBody("x".repeat(181)).endsWith("…")).toBe(true);
    expect(truncateToastBody("x".repeat(181)).length).toBe(180);
  });
});
