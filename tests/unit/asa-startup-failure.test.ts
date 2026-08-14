import { describe, expect, it } from "vitest";
import { diagnoseAsaStartupFailure, sanitizeAsaLogExcerpt } from "@shared/asa-startup-failure";

const CFCORE_SNIPPET = `
[2026.08.13-22.52.16:111][  0]LogCFCore: Detected OS Windows: 10.0.26200.1.256.64bit
[2026.08.13-22.52.16:490][ 11]LogCFCore: No need to update existing mod: Tek Creations (933588)
[2026.08.13-22.52.16:490][ 11]ASAMods: Error: Not all mods were installed. Check the log for CFCore errors.
If you have any Custom Cosmetics in the mod list please remove them.
Attempting to install pc-only mods on a cross-platform server will also fail to install.
Mods not installed: 1039450
`;

describe("diagnoseAsaStartupFailure", () => {
  it("detects CFCore cosmetics / PC-only mods not installed", () => {
    const result = diagnoseAsaStartupFailure(CFCORE_SNIPPET);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("mods_not_installed");
    expect(result?.missingModIds).toEqual(["1039450"]);
    expect(result?.summary).toContain("1039450");
    expect(result?.suggestion).toMatch(/cosmetics|skins/i);
    expect(result?.excerpt).toContain("Not all mods were installed");
  });

  it("detects a Fatal error line", () => {
    const result = diagnoseAsaStartupFailure(
      "2026-08-13 16:52:16.036 [0] LogTemp: hello\nFatal error!\nAssertion failed",
    );
    expect(result?.kind).toBe("fatal");
    expect(result?.summary).toContain("Assertion failed");
    expect(result?.excerpt).toContain("Fatal error");
    expect(result?.excerpt).toContain("Assertion failed");
  });

  it("returns null when the log is only startup noise", () => {
    expect(
      diagnoseAsaStartupFailure(
        "Log file open, 08/13/26 16:52:15\nARK Version: 92.37",
      ),
    ).toBeNull();
  });

  it("bounds and strips control characters from excerpts", () => {
    const cleaned = sanitizeAsaLogExcerpt(`Fatal\0 error!\n${"x".repeat(3_000)}`);
    expect(cleaned).not.toContain("\0");
    expect(cleaned.endsWith("…")).toBe(true);
    expect(cleaned.length).toBeLessThanOrEqual(2_001);
  });
});
