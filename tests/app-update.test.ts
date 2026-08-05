import { describe, expect, it } from "vitest";
import {
  allowsPrereleaseUpdates,
  compareSemver,
  createIdleAppUpdateStatus,
  installBlockMessage,
  pickNewestAllowedRelease,
  stripVersionPrefix,
} from "../src/shared/app-update";

describe("app-update helpers", () => {
  it("strips optional v prefix", () => {
    expect(stripVersionPrefix("v1.2.3")).toBe("1.2.3");
    expect(stripVersionPrefix("1.2.3")).toBe("1.2.3");
  });

  it("compares semver cores and prerelease order", () => {
    expect(compareSemver("0.5.2", "0.5.3")).toBeLessThan(0);
    expect(compareSemver("v0.6.0", "0.5.9")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBeLessThan(0);
  });

  it("allows GitHub prereleases only while on 0.x", () => {
    expect(allowsPrereleaseUpdates("0.5.2")).toBe(true);
    expect(allowsPrereleaseUpdates("v0.9.9")).toBe(true);
    expect(allowsPrereleaseUpdates("1.0.0")).toBe(false);
    expect(allowsPrereleaseUpdates("1.2.3")).toBe(false);
  });

  it("picks the newest allowed release, including 0.x GitHub prereleases", () => {
    const releases = [
      {
        tag_name: "v0.5.1",
        html_url: "https://github.com/gabomarin/yark/releases/tag/v0.5.1",
        prerelease: true,
        draft: false,
      },
      {
        tag_name: "v0.4.0",
        prerelease: true,
        draft: false,
      },
      {
        tag_name: "v0.5.2",
        prerelease: true,
        draft: true,
      },
    ];
    const newest = pickNewestAllowedRelease(releases, "0.5.0");
    expect(newest?.tag_name).toBe("v0.5.1");
  });

  it("ignores GitHub prereleases once the app is 1.0+", () => {
    const releases = [
      { tag_name: "v1.0.1", prerelease: true, draft: false },
      { tag_name: "v1.0.0", prerelease: false, draft: false },
    ];
    expect(pickNewestAllowedRelease(releases, "1.0.0")?.tag_name).toBe("v1.0.0");
  });

  it("marks unpackaged builds as install-blocked (dev)", () => {
    const status = createIdleAppUpdateStatus("0.5.2", false);
    expect(status.installBlockedReason).toBe("dev");
    expect(status.installBlockedMessage).toBe(installBlockMessage("dev"));
  });

  it("marks packaged idle builds as not-ready until download completes", () => {
    const status = createIdleAppUpdateStatus("0.5.2", true);
    expect(status.installBlockedReason).toBe("not-ready");
  });
});
