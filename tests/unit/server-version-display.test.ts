import { describe, expect, it } from "vitest";
import {
  isArkStyleVersion,
  normalizeArkVersionLabel,
  resolveDisplayedServerVersion,
  shouldHintVersionRefreshesOnStart,
  VERSION_REFRESHES_ON_START_HINT,
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

  it("does not surface Steam build ids as the displayed version", () => {
    expect(
      resolveDisplayedServerVersion({
        arkVersion: null,
        build: "build 24440006",
        version: "build 24440006",
      }),
    ).toBeNull();
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

describe("shouldHintVersionRefreshesOnStart", () => {
  it("hints when Steam is current but displayed ARK differs from official", () => {
    expect(
      shouldHintVersionRefreshesOnStart({
        updateState: "current",
        localVersion: "92.25",
        officialVersion: "92.28",
      }),
    ).toBe(true);
    expect(VERSION_REFRESHES_ON_START_HINT).toMatch(
      /Version refreshes after you start the server/i,
    );
  });

  it("treats v-prefix as the same label", () => {
    expect(normalizeArkVersionLabel("v92.28")).toBe("92.28");
    expect(
      shouldHintVersionRefreshesOnStart({
        updateState: "current",
        localVersion: "v92.28",
        officialVersion: "92.28",
      }),
    ).toBe(false);
  });

  it("does not hint when an update is available or versions match", () => {
    expect(
      shouldHintVersionRefreshesOnStart({
        updateState: "available",
        localVersion: "92.25",
        officialVersion: "92.28",
      }),
    ).toBe(false);
    expect(
      shouldHintVersionRefreshesOnStart({
        updateState: "current",
        localVersion: "92.28",
        officialVersion: "92.28",
      }),
    ).toBe(false);
  });
});
