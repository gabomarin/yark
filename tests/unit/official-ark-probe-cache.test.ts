import { describe, expect, it } from "vitest";
import {
  OFFICIAL_BUILD_TTL_WHILE_DEPLOYING_MS,
  resolveOfficialBuildCacheMaxAgeMs,
} from "../../src/backend/domains/instances/official-ark-probe";

describe("resolveOfficialBuildCacheMaxAgeMs", () => {
  it("uses a short TTL while Wildcard is Deploying so Steam buildid can catch up", () => {
    expect(resolveOfficialBuildCacheMaxAgeMs("deploying")).toBe(OFFICIAL_BUILD_TTL_WHILE_DEPLOYING_MS);
    expect(OFFICIAL_BUILD_TTL_WHILE_DEPLOYING_MS).toBeLessThanOrEqual(60_000);
  });

  it("keeps the longer stable TTL when the official network is not Deploying", () => {
    expect(resolveOfficialBuildCacheMaxAgeMs("online")).toBeGreaterThan(OFFICIAL_BUILD_TTL_WHILE_DEPLOYING_MS);
    expect(resolveOfficialBuildCacheMaxAgeMs("offline")).toBeGreaterThan(OFFICIAL_BUILD_TTL_WHILE_DEPLOYING_MS);
    expect(resolveOfficialBuildCacheMaxAgeMs("unknown")).toBeGreaterThan(OFFICIAL_BUILD_TTL_WHILE_DEPLOYING_MS);
  });
});
