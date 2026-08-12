import { describe, expect, it } from "vitest";
import { formatTrayServerStatus } from "@shared/app-tray-status";

describe("formatTrayServerStatus (#54)", () => {
  it("formats zero, one, and many running servers", () => {
    expect(formatTrayServerStatus(0)).toBe("No servers running");
    expect(formatTrayServerStatus(1)).toBe("1 server running");
    expect(formatTrayServerStatus(3)).toBe("3 servers running");
  });
});
