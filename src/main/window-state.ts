import type { BrowserWindow } from "electron";
import type { AppSettingsRepository } from "../backend/infra/db/app-settings-repository";

export const WINDOW_STATE_SETTING_KEY = "windowState";

export const DEFAULT_WINDOW_WIDTH = 1280;
export const DEFAULT_WINDOW_HEIGHT = 800;
export const MIN_WINDOW_WIDTH = 960;
export const MIN_WINDOW_HEIGHT = 600;

export interface PersistedWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

/** Minimal display work-area shape (Electron `Display.workArea`). */
export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowCreationOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  shouldMaximize: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampWindowSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(MIN_WINDOW_WIDTH, Math.round(width)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.round(height)),
  };
}

/** Returns null when the payload is missing or malformed. */
export function parseWindowState(raw: string | null | undefined): PersistedWindowState | null {
  if (raw == null || raw.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      !isFiniteNumber(record.x) ||
      !isFiniteNumber(record.y) ||
      !isFiniteNumber(record.width) ||
      !isFiniteNumber(record.height)
    ) {
      return null;
    }
    const size = clampWindowSize(record.width, record.height);
    return {
      x: Math.round(record.x),
      y: Math.round(record.y),
      width: size.width,
      height: size.height,
      isMaximized: record.isMaximized === true,
    };
  } catch {
    return null;
  }
}

export function serializeWindowState(state: PersistedWindowState): string {
  return JSON.stringify(state);
}

/**
 * True when a meaningful portion of the window intersects some display work area
 * (avoids restoring onto a disconnected monitor).
 */
export function isWindowStateVisibleOnDisplays(
  state: Pick<PersistedWindowState, "x" | "y" | "width" | "height">,
  displays: DisplayWorkArea[],
): boolean {
  if (displays.length === 0) {
    return true;
  }
  const margin = 40;
  for (const area of displays) {
    const overlapX =
      Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x);
    const overlapY =
      Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y);
    if (overlapX >= margin && overlapY >= margin) {
      return true;
    }
  }
  return false;
}

export function findWorkAreaContainingPoint(
  x: number,
  y: number,
  displays: DisplayWorkArea[],
): DisplayWorkArea | null {
  for (const area of displays) {
    if (
      x >= area.x &&
      x < area.x + area.width &&
      y >= area.y &&
      y < area.y + area.height
    ) {
      return area;
    }
  }
  return null;
}

export function nearestWorkArea(
  x: number,
  y: number,
  displays: DisplayWorkArea[],
): DisplayWorkArea | null {
  const hit = findWorkAreaContainingPoint(x, y, displays);
  if (hit !== null) {
    return hit;
  }
  const first = displays[0];
  if (first === undefined) {
    return null;
  }
  let best = first;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const area of displays) {
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const dist = (cx - x) ** 2 + (cy - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = area;
    }
  }
  return best;
}

export function centerSizeInWorkArea(
  width: number,
  height: number,
  area: DisplayWorkArea,
): { x: number; y: number } {
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
  };
}

/**
 * Center a splash on the same display the main window will use.
 * Saved bounds → that monitor; otherwise the fallback point's monitor.
 */
export function resolveSplashPlacement(
  size: { width: number; height: number },
  creation: Pick<WindowCreationOptions, "x" | "y" | "width" | "height">,
  displays: DisplayWorkArea[],
  fallbackPoint: { x: number; y: number },
): { x: number; y: number } {
  const anchorX =
    creation.x !== undefined ? creation.x + creation.width / 2 : fallbackPoint.x;
  const anchorY =
    creation.y !== undefined ? creation.y + creation.height / 2 : fallbackPoint.y;
  const area = nearestWorkArea(anchorX, anchorY, displays);
  if (area === null) {
    return {
      x: Math.round(fallbackPoint.x - size.width / 2),
      y: Math.round(fallbackPoint.y - size.height / 2),
    };
  }
  return centerSizeInWorkArea(size.width, size.height, area);
}

/**
 * First launch / invalid state → maximize.
 * Saved restored bounds on-screen → restore.
 * Saved maximized → restore normal bounds then maximize.
 */
export function resolveWindowCreationOptions(
  stored: PersistedWindowState | null,
  displays: DisplayWorkArea[],
): WindowCreationOptions {
  if (stored === null || !isWindowStateVisibleOnDisplays(stored, displays)) {
    return {
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      shouldMaximize: true,
    };
  }

  return {
    width: stored.width,
    height: stored.height,
    x: stored.x,
    y: stored.y,
    shouldMaximize: stored.isMaximized,
  };
}

export function readStoredWindowState(
  settings: AppSettingsRepository,
): PersistedWindowState | null {
  return parseWindowState(settings.get(WINDOW_STATE_SETTING_KEY));
}

export function writeStoredWindowState(
  settings: AppSettingsRepository,
  state: PersistedWindowState,
): void {
  settings.set(WINDOW_STATE_SETTING_KEY, serializeWindowState(state));
}

export function captureWindowState(win: BrowserWindow): PersistedWindowState | null {
  if (win.isDestroyed()) {
    return null;
  }
  const bounds = win.getNormalBounds();
  const size = clampWindowSize(bounds.width, bounds.height);
  return {
    x: bounds.x,
    y: bounds.y,
    width: size.width,
    height: size.height,
    isMaximized: win.isMaximized(),
  };
}

/** Persist bounds (and maximized flag) across move/resize/maximize and on close. */
export function attachWindowStatePersistence(
  win: BrowserWindow,
  settings: AppSettingsRepository,
): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const persist = (): void => {
    const state = captureWindowState(win);
    if (state === null) {
      return;
    }
    writeStoredWindowState(settings, state);
  };

  const schedulePersist = (): void => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 250);
  };

  win.on("resize", schedulePersist);
  win.on("move", schedulePersist);
  win.on("maximize", schedulePersist);
  win.on("unmaximize", schedulePersist);
  win.on("close", () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    persist();
  });
}
