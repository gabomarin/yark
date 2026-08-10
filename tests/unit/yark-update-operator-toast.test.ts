import { describe, expect, it } from "vitest";
import { createIdleAppUpdateStatus } from "@shared/app-update";
import {
  yarkUpdateToastCopy,
  yarkUpdateToastDedupeKey,
} from "@ui/yarkUpdateOperatorToast";

describe("yarkUpdateOperatorToast", () => {
  it("toasts once available with a version", () => {
    const status = {
      ...createIdleAppUpdateStatus("0.8.0", true),
      phase: "available" as const,
      availableVersion: "0.8.1",
    };
    expect(yarkUpdateToastDedupeKey(status)).toBe("available:0.8.1");
    expect(yarkUpdateToastCopy(status)?.title).toBe("YARK update available");
  });

  it("toasts when download is ready to install", () => {
    const status = {
      ...createIdleAppUpdateStatus("0.8.0", true),
      phase: "ready" as const,
      availableVersion: "0.8.1",
    };
    expect(yarkUpdateToastDedupeKey(status)).toBe("ready:0.8.1");
    expect(yarkUpdateToastCopy(status)?.title).toBe(
      "YARK update ready to install",
    );
  });

  it("skips idle, checking, up-to-date, and errors", () => {
    for (const phase of ["idle", "checking", "up-to-date", "error", "downloading"] as const) {
      const status = {
        ...createIdleAppUpdateStatus("0.8.0", true),
        phase,
        availableVersion: phase === "downloading" ? "0.8.1" : null,
      };
      expect(yarkUpdateToastDedupeKey(status)).toBeNull();
      expect(yarkUpdateToastCopy(status)).toBeNull();
    }
  });
});
