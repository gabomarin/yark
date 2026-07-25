import { describe, expect, it } from "vitest";
import { resolveEventDetails } from "@shared/event-details";
import type { AppEvent } from "@shared/types";

function base(overrides: Partial<AppEvent> = {}): AppEvent {
  return {
    id: 1,
    serverId: "srv-1",
    type: "error",
    severity: "error",
    message: "Something failed",
    createdAt: "2026-07-25T00:00:00.000Z",
    details: null,
    ...overrides,
  };
}

describe("resolveEventDetails", () => {
  it("falls back to the type catalog when details are missing", () => {
    const resolved = resolveEventDetails(base({ type: "update_failed" }));
    expect(resolved.what).toMatch(/SteamCMD/i);
    expect(resolved.suggestion).toMatch(/Updates tab/i);
  });

  it("prefers stored details over the catalog", () => {
    const resolved = resolveEventDetails(
      base({
        type: "update_failed",
        details: {
          what: "Custom what",
          cause: "Custom cause",
          location: "D:\\logs",
          suggestion: "Do X",
          context: { exitCode: 8 },
        },
      }),
    );
    expect(resolved.what).toBe("Custom what");
    expect(resolved.cause).toBe("Custom cause");
    expect(resolved.location).toBe("D:\\logs");
    expect(resolved.suggestion).toBe("Do X");
    expect(resolved.context).toContainEqual({ label: "exitCode", value: "8" });
  });
});
