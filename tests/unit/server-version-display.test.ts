import { describe, expect, it } from "vitest";
import {
  compareArkVersionLabels,
  isArkStyleVersion,
  normalizeArkVersionLabel,
  resolveDisplayedServerVersion,
  shouldHintVersionRefreshesOnStart,
  VERSION_REFRESHES_ON_START_HINT,
} from "@shared/server-version-display";

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

  it("ignores non-ARK-style arkVersion the same way as Steam builds", () => {
    expect(
      resolveDisplayedServerVersion({
        arkVersion: "build 24440006",
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

describe("compareArkVersionLabels", () => {
  it("orders dotted ARK versions numerically", () => {
    expect(compareArkVersionLabels("92.47", "92.54")).toBeLessThan(0);
    expect(compareArkVersionLabels("92.54", "92.47")).toBeGreaterThan(0);
    expect(compareArkVersionLabels("v92.54", "92.54")).toBe(0);
  });

  it("returns null for non-ARK labels", () => {
    expect(compareArkVersionLabels("build 1", "92.54")).toBeNull();
  });
});

describe("shouldHintVersionRefreshesOnStart", () => {
  it("hints when Steam is current and displayed ARK is behind official", () => {
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

  it("does not hint when dedicated ARK Version is ahead of officials", () => {
    expect(
      shouldHintVersionRefreshesOnStart({
        updateState: "current",
        localVersion: "92.54",
        officialVersion: "92.47",
      }),
    ).toBe(false);
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

  it("hints when Steam is current and versionRefreshPending after Verify (#490)", () => {
    expect(
      shouldHintVersionRefreshesOnStart({
        updateState: "current",
        localVersion: "92.25",
        officialVersion: "92.25",
        versionRefreshPending: true,
      }),
    ).toBe(true);
  });

  it("never hints when updateState is available even if pending (#490)", () => {
    expect(
      shouldHintVersionRefreshesOnStart({
        updateState: "available",
        localVersion: "92.25",
        officialVersion: "92.28",
        versionRefreshPending: true,
      }),
    ).toBe(false);
  });
});
