import { describe, expect, it } from "vitest";
import {
  guidanceForReasonCodes,
  installationHealthLabel,
  isInstallHealthDegradation,
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
    expect(installationHealthLabel("unknown")).toBe("Checking…");
  });

  it("resolves guidance from reason codes", () => {
    expect(guidanceForReasonCodes(["exe_absent"])).toMatch(/Install or Verify/i);
  });

  it("emits degradation only when health gets worse after a known state", () => {
    expect(isInstallHealthDegradation(null, "missing")).toBe(false);
    expect(isInstallHealthDegradation("unknown", "missing")).toBe(false);
    expect(isInstallHealthDegradation("ready", "ready")).toBe(false);
    expect(isInstallHealthDegradation("ready", "missing")).toBe(true);
    expect(isInstallHealthDegradation("empty", "incomplete")).toBe(true);
    expect(isInstallHealthDegradation("incomplete", "empty")).toBe(false);
  });
});
