import { describe, expect, it } from "vitest";
import {
  formatInstallationCheckedAt,
  guidanceForReasonCodes,
  installationHealthLabel,
  isInstallHealthDegradation,
  isInstallOfferHealth,
  isInstallationReady,
} from "@shared/installation-health";
import { stubInstallationInfo } from "../helpers/installation-info";

describe("installation-health helpers", () => {
  it("treats ready health as installation ready", () => {
    expect(
      isInstallationReady(stubInstallationInfo({ serverId: "a", health: "ready" })),
    ).toBe(true);
    expect(
      isInstallationReady(
        stubInstallationInfo({ serverId: "b", health: "incomplete", installed: false }),
      ),
    ).toBe(false);
  });

  it("maps health to short labels", () => {
    expect(installationHealthLabel("missing")).toBe("Missing path");
    expect(installationHealthLabel("unknown")).toBe("Check failed");
    expect(installationHealthLabel(null)).toBe("Checking…");
  });

  it("offers Install only for missing/empty/incomplete", () => {
    expect(isInstallOfferHealth("missing")).toBe(true);
    expect(isInstallOfferHealth("empty")).toBe(true);
    expect(isInstallOfferHealth("incomplete")).toBe(true);
    expect(isInstallOfferHealth("suspicious")).toBe(false);
    expect(isInstallOfferHealth("unknown")).toBe(false);
    expect(isInstallOfferHealth("inaccessible")).toBe(false);
  });

  it("resolves guidance from reason codes", () => {
    expect(guidanceForReasonCodes(["exe_absent"])).toMatch(/Install or Verify/i);
    expect(guidanceForReasonCodes(["foreign_contents"])).toMatch(/real ASA server install/i);
  });

  it("formats checkedAt for display", () => {
    expect(formatInstallationCheckedAt(null)).toBe("—");
    expect(formatInstallationCheckedAt("not-a-date")).toBe("—");
    expect(formatInstallationCheckedAt("2026-07-24T12:00:00.000Z")).not.toBe("—");
  });

  it("emits degradation only when health gets worse after a known state", () => {
    expect(isInstallHealthDegradation(null, "missing")).toBe(false);
    expect(isInstallHealthDegradation("ready", "ready")).toBe(false);
    expect(isInstallHealthDegradation("ready", "missing")).toBe(true);
    expect(isInstallHealthDegradation("ready", "unknown")).toBe(true);
    expect(isInstallHealthDegradation("empty", "incomplete")).toBe(true);
    expect(isInstallHealthDegradation("incomplete", "empty")).toBe(false);
  });
});
