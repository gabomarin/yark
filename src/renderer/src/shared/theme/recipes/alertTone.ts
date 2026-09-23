/**
 * Alert severity mapping (#PUX-004). Shared by the base Alert recipe and by
 * `AppAlert`, which mirrors it for its icon. Lives outside `theme.ts` so the
 * per-family recipe modules can import it without a cycle.
 */

/** Inline Alert surface recipes: message (blue), warn (fossil), error (red). */
export function alertToneForColor(color: string): "message" | "success" | "warn" | "error" | "default" {
  if (color === "blue" || color === "cyan" || color === "indigo" || color === "violet") {
    return "message";
  }
  /* `ok` is the app's success role; green/teal are accepted aliases so an Alert
   * keeps its meaning whether the call site still says one or the other. */
  if (color === "ok" || color === "green" || color === "teal") {
    return "success";
  }
  if (color === "yellow" || color === "orange" || color === "fossil" || color === "attention" || color === "warn") {
    return "warn";
  }
  if (color === "red" || color === "pink") {
    return "error";
  }
  return "default";
}

/**
 * Severity tone to the token that carries it, used for the alert border, its 12% fill tint
 * and its icon. `default` has no tone, so an unmapped colour keeps Mantine's defaults.
 */
export const ALERT_TONE_TOKENS: Partial<Record<ReturnType<typeof alertToneForColor>, string>> = {
  message: "var(--app-color-cryo)",
  success: "var(--app-color-ok)",
  warn: "var(--app-color-fossil)",
  error: "var(--app-color-bad)",
};
