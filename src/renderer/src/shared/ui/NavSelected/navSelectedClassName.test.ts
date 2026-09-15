import { describe, expect, it } from "vitest";
import { navSelectedClassName } from "./navSelectedClassName";

describe("navSelectedClassName", () => {
  it("always includes the shared selected-nav class", () => {
    expect(navSelectedClassName()).toMatch(/root/);
  });

  it("appends extra class names and skips empties", () => {
    const next = navSelectedClassName("navLink", undefined, "");
    expect(next.split(" ").filter((item) => item.length > 0)).toHaveLength(2);
    expect(next).toContain("navLink");
  });
});
