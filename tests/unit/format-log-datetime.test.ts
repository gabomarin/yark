import { describe, expect, it } from "vitest";
import {
  formatLogDateTime,
  formatLogDateTimeParts,
} from "@shared/format-log-datetime";

describe("formatLogDateTimeParts", () => {
  it("formats without ms", () => {
    expect(formatLogDateTimeParts(2026, 7, 29, 15, 42, 52)).toBe(
      "2026-07-29 15:42:52",
    );
  });

  it("formats with ms", () => {
    expect(formatLogDateTimeParts(2026, 7, 29, 15, 42, 52, 443)).toBe(
      "2026-07-29 15:42:52.443",
    );
  });
});

describe("formatLogDateTime", () => {
  it("formats a Date in local wall-clock", () => {
    const date = new Date(2026, 6, 29, 15, 42, 52, 0);
    expect(formatLogDateTime(date)).toBe("2026-07-29 15:42:52");
  });

  it("returns em dash for nullish", () => {
    expect(formatLogDateTime(null)).toBe("—");
    expect(formatLogDateTime(undefined)).toBe("—");
  });

  it("returns original string when unparsable and no fallback override", () => {
    expect(formatLogDateTime("not-a-date")).toBe("not-a-date");
  });
});
