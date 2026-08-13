import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  clampWindowSize,
  isWindowStateVisibleOnDisplays,
  parseWindowState,
  resolveSplashPlacement,
  resolveWindowCreationOptions,
  serializeWindowState,
  type PersistedWindowState,
} from "../../src/main/window-state";

const primary: { x: number; y: number; width: number; height: number } = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
};
const secondary: { x: number; y: number; width: number; height: number } = {
  x: 1920,
  y: 0,
  width: 2560,
  height: 1440,
};

describe("window-state", () => {
  it("clamps below minimum size", () => {
    expect(clampWindowSize(100, 50)).toEqual({
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT,
    });
  });

  it("parses and serializes a round-trip state", () => {
    const state: PersistedWindowState = {
      x: 40,
      y: 60,
      width: 1400,
      height: 900,
      isMaximized: false,
    };
    expect(parseWindowState(serializeWindowState(state))).toEqual(state);
  });

  it("rejects malformed payloads", () => {
    expect(parseWindowState(null)).toBeNull();
    expect(parseWindowState("{")).toBeNull();
    expect(parseWindowState(JSON.stringify({ width: 1280 }))).toBeNull();
  });

  it("detects off-screen restored bounds", () => {
    expect(
      isWindowStateVisibleOnDisplays(
        { x: 8000, y: 0, width: 1280, height: 800 },
        [primary],
      ),
    ).toBe(false);
    expect(
      isWindowStateVisibleOnDisplays(
        { x: 100, y: 100, width: 1280, height: 800 },
        [primary],
      ),
    ).toBe(true);
  });

  it("maximizes on first launch or invalid state", () => {
    expect(resolveWindowCreationOptions(null, [primary])).toEqual({
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      shouldMaximize: true,
    });
    expect(
      resolveWindowCreationOptions(
        { x: 9000, y: 0, width: 1280, height: 800, isMaximized: false },
        [primary],
      ).shouldMaximize,
    ).toBe(true);
  });

  it("restores saved normal bounds and maximized flag", () => {
    const restored = resolveWindowCreationOptions(
      { x: 12, y: 34, width: 1400, height: 900, isMaximized: false },
      [primary],
    );
    expect(restored).toEqual({
      width: 1400,
      height: 900,
      x: 12,
      y: 34,
      shouldMaximize: false,
    });

    const maximized = resolveWindowCreationOptions(
      { x: 12, y: 34, width: 1400, height: 900, isMaximized: true },
      [primary],
    );
    expect(maximized.shouldMaximize).toBe(true);
    expect(maximized.x).toBe(12);
    expect(maximized.y).toBe(34);
  });
});

describe("resolveSplashPlacement", () => {
  const splash = { width: 520, height: 560 };
  const primaryCenter = { x: 960, y: 540 };

  it("centers on the saved window's monitor", () => {
    const pos = resolveSplashPlacement(
      splash,
      { x: 2100, y: 80, width: 1280, height: 800 },
      [primary, secondary],
      primaryCenter,
    );
    expect(pos).toEqual({
      x: Math.round(1920 + (2560 - 520) / 2),
      y: Math.round((1440 - 560) / 2),
    });
  });

  it("falls back to the fallback point's monitor", () => {
    const pos = resolveSplashPlacement(
      splash,
      { width: 1280, height: 800 },
      [primary, secondary],
      primaryCenter,
    );
    expect(pos).toEqual({
      x: Math.round((1920 - 520) / 2),
      y: Math.round((1080 - 560) / 2),
    });
  });
});
