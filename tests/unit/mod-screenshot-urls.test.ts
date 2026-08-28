import { describe, expect, it } from "vitest";
import {
  MAX_MOD_SCREENSHOT_URLS,
  normalizeModScreenshotUrls,
} from "@shared/mod-screenshot-urls";

describe("normalizeModScreenshotUrls", () => {
  it("keeps https URLs only and caps length", () => {
    const urls = Array.from({ length: 12 }, (_, i) => `https://cdn.example/${i}.jpg`);
    const next = normalizeModScreenshotUrls([
      "http://insecure.example/a.jpg",
      "  ",
      null,
      ...urls,
      "https://cdn.example/0.jpg",
      "ftp://cdn.example/x.jpg",
    ]);
    expect(next).toHaveLength(MAX_MOD_SCREENSHOT_URLS);
    expect(next[0]).toBe("https://cdn.example/0.jpg");
    expect(next.every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("returns empty for missing or empty input", () => {
    expect(normalizeModScreenshotUrls(undefined)).toEqual([]);
    expect(normalizeModScreenshotUrls(null)).toEqual([]);
    expect(normalizeModScreenshotUrls([])).toEqual([]);
  });
});
