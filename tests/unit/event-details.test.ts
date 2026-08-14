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

  it("describes stopped-server updates and verify auto-stop for update_started rows", () => {
    const resolved = resolveEventDetails(base({ type: "update_started", severity: "info" }));
    expect(resolved.suggestion).toMatch(/updates require a stopped server/i);
    expect(resolved.suggestion).toMatch(/verify may stop and restart/i);
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
    expect(resolved.excerpt).toBeNull();
    expect(resolved.context).toContainEqual({ label: "exitCode", value: "8" });
  });

  it("keeps a stored ShooterGame.log excerpt on server_crashed", () => {
    const resolved = resolveEventDetails(
      base({
        type: "server_crashed",
        message: "ASA fatal: Assertion failed",
        details: {
          what: "ASA fatal: Assertion failed",
          excerpt: "Fatal error!\nAssertion failed: nullptr+8",
        },
      }),
    );
    expect(resolved.excerpt).toContain("Assertion failed: nullptr+8");
  });

  it("describes installation health degradation", () => {
    const resolved = resolveEventDetails(
      base({ type: "installation_health_degraded", severity: "warning" }),
    );
    expect(resolved.what).toMatch(/install path/i);
    expect(resolved.suggestion).toMatch(/Check Servers Health/i);
  });

  it("describes move installation outcomes", () => {
    expect(
      resolveEventDetails(base({ type: "install_move_started", severity: "info" })).what,
    ).toMatch(/Move installation/i);
    expect(
      resolveEventDetails(base({ type: "install_move_completed", severity: "info" }))
        .suggestion,
    ).toMatch(/previous install folder is removed/i);
    expect(
      resolveEventDetails(base({ type: "install_move_failed", severity: "error" }))
        .suggestion,
    ).toMatch(/original install path remains authoritative/i);
    expect(
      resolveEventDetails(base({ type: "install_move_cancelled", severity: "warning" }))
        .what,
    ).toMatch(/cancelled/i);
  });
});
