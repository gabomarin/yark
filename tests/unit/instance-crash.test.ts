import { describe, expect, it } from "vitest";
import { planUnexpectedServerCrashEvent } from "@backend/domains/instances/instance-crash";

describe("planUnexpectedServerCrashEvent", () => {
  it("builds crash event details and notify payload", () => {
    const planned = planUnexpectedServerCrashEvent({
      payload: {
        serverId: "srv-1",
        exitCode: 1,
        phase: "starting",
        lastError: "Assertion failed",
        diagnosis: {
          kind: "mods_not_installed",
          summary: "Assertion failed",
          cause: "mod",
          suggestion: "Retry",
          excerpt: "Assertion failed: nullptr",
          missingModIds: ["123"],
        },
      },
      serverName: "Island",
    });
    expect(planned.eventType).toBe("server_crashed");
    expect(planned.details.context.missingModIds).toBe("123");
    expect(planned.notify.serverName).toBe("Island");
  });

  it("omits GUS password settings from crash excerpts", () => {
    const planned = planUnexpectedServerCrashEvent({
      payload: {
        serverId: "srv-1",
        exitCode: 1,
        phase: "starting",
        lastError: "Assertion failed",
        diagnosis: {
          kind: "fatal",
          summary: "Assertion failed",
          cause: "fatal",
          suggestion: "Retry",
          excerpt:
            "[ServerSettings]\nServerAdminPassword=hunter2-secret\nMaxPlayers=70",
          missingModIds: [],
        },
      },
      serverName: "Island",
    });
    expect(planned.details.excerpt).not.toMatch(/ServerAdminPassword/i);
    expect(planned.details.excerpt).not.toContain("hunter2-secret");
    expect(planned.details.excerpt).toContain("MaxPlayers=70");
  });
});
