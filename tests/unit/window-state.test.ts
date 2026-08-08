import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  clampWindowSize,
  isWindowStateVisibleOnDisplays,
  parseWindowState,
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
