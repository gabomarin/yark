import userEvent from "@testing-library/user-event";

/**
 * Instant `userEvent` for renderer suites. `delay: null` skips per-keystroke
 * `setTimeout` (the default `0` still queues a macrotask per character) so
 * page-level typing tests stay cheap (#281).
 */
export function setupUser(): ReturnType<typeof userEvent.setup> {
  return userEvent.setup({ delay: null });
}
