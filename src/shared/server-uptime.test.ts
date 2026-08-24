import { describe, expect, it } from "vitest";
import { formatServerUptime } from "./server-uptime";

describe("formatServerUptime", () => {
  const now = Date.parse("2026-08-24T18:00:00.000Z");

  it("returns em dash when not started", () => {
    expect(formatServerUptime(null, now)).toBe("–");
    expect(formatServerUptime("", now)).toBe("–");
  });

  it("formats minutes, hours, and days", () => {
    expect(formatServerUptime("2026-08-24T17:45:00.000Z", now)).toBe("15m");
    expect(formatServerUptime("2026-08-24T15:30:00.000Z", now)).toBe("2h 30m");
    expect(formatServerUptime("2026-08-22T18:00:00.000Z", now)).toBe("2d 0h");
  });
});
