import { describe, expect, it } from "vitest";
import {
  isArkStyleVersion,
  resolveDisplayedServerVersion,
} from "../../src/shared/server-version-display";

describe("resolveDisplayedServerVersion", () => {
  it("prefers an ARK-style file build over a stale log arkVersion", () => {
    expect(
      resolveDisplayedServerVersion({
        arkVersion: "92.25",
        build: "92.28",
        version: "92.28",
      }),
    ).toBe("92.28");
  });

  it("falls back to arkVersion when build is a Steam id", () => {
    expect(
      resolveDisplayedServerVersion({
        arkVersion: "92.25",
        build: "build 24346423",
        version: "build 24346423",
      }),
    ).toBe("92.25");
  });

  it("uses build when arkVersion is missing", () => {
    expect(
      resolveDisplayedServerVersion({
        arkVersion: null,
        build: "92.28",
        version: "92.28",
      }),
    ).toBe("92.28");
  });

  it("returns null when nothing is available", () => {
    expect(
      resolveDisplayedServerVersion({
        arkVersion: null,
        build: null,
        version: null,
      }),
    ).toBeNull();
  });
});

describe("isArkStyleVersion", () => {
  it("accepts dotted numeric versions", () => {
    expect(isArkStyleVersion("92.28")).toBe(true);
    expect(isArkStyleVersion("57.20")).toBe(true);
  });

  it("accepts optional v prefix", () => {
    expect(isArkStyleVersion("v57.18")).toBe(true);
    expect(isArkStyleVersion("V92.28")).toBe(true);
  });

  it("rejects Steam build labels", () => {
    expect(isArkStyleVersion("build 24346423")).toBe(false);
    expect(isArkStyleVersion("CL-123")).toBe(false);
  });
});

describe("resolveDisplayedServerVersion with v-prefixed builds", () => {
  it("prefers a v-prefixed file build over a stale log arkVersion", () => {
    expect(
      resolveDisplayedServerVersion({
        arkVersion: "92.25",
        build: "v92.28",
        version: "v92.28",
      }),
    ).toBe("v92.28");
  });
});
