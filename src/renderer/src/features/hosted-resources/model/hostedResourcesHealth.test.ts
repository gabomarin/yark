import type { HostedResourcesDiagnosticsDto } from "@shared/ipc";
import { describe, expect, it } from "vitest";
import { summarizeHostedResourcesHealth } from "./hostedResourcesHealth";

function diagnostics(
  overrides: Partial<HostedResourcesDiagnosticsDto> = {},
): HostedResourcesDiagnosticsDto {
  return {
    state: { enabled: true, port: 8935, bindHost: "127.0.0.1", listening: true, error: null },
    checkedAt: new Date().toISOString(),
    ownership: { ok: true, message: "YARK is listening." },
    resources: [],
    references: [],
    ...overrides,
  };
}

describe("summarizeHostedResourcesHealth", () => {
  it("starts neutral before a diagnostic run", () => {
    expect(summarizeHostedResourcesHealth(null).state).toBe("neutral");
  });

  it("reports an unavailable enabled host as an error", () => {
    expect(
      summarizeHostedResourcesHealth(
        diagnostics({ ownership: { ok: false, message: "The port is unavailable." } }),
      ),
    ).toMatchObject({ state: "error", label: "Hosted Resources unavailable" });
  });

  it("reports stale references as a warning for the affected server", () => {
    const reference = {
      resourceId: "resource-1",
      serverId: "server-1",
      serverName: "Alpha",
      key: "AdminListURL",
      url: "http://127.0.0.1:8935/r/resource-1",
      status: "stale-port" as const,
    };
    const summary = summarizeHostedResourcesHealth(diagnostics({ references: [reference] }));

    expect(summary).toMatchObject({ state: "warning", label: "Hosted Resources need attention" });
    expect(summary.referencesByServerId.get("server-1")).toEqual([reference]);
  });

  it("reports an off host with server references as an error", () => {
    const reference = {
      resourceId: "resource-1",
      serverId: "server-1",
      serverName: "Alpha",
      key: "AdminListURL",
      url: "http://127.0.0.1:8935/r/resource-1",
      status: "current" as const,
    };

    expect(
      summarizeHostedResourcesHealth(
        diagnostics({
          state: { enabled: false, port: 8935, bindHost: "127.0.0.1", listening: false, error: null },
          references: [reference],
        }),
      ),
    ).toMatchObject({ state: "error", label: "Hosted Resources unavailable" });
  });

  it("keeps an off host with no server references neutral", () => {
    expect(
      summarizeHostedResourcesHealth(
        diagnostics({
          state: { enabled: false, port: 8935, bindHost: "127.0.0.1", listening: false, error: null },
        }),
      ),
    ).toMatchObject({ state: "neutral", label: "Hosted Resources off" });
  });

  it("reports verified content as healthy", () => {
    expect(
      summarizeHostedResourcesHealth(
        diagnostics({
          resources: [
            {
              resourceId: "resource-1",
              displayName: "Admin list",
              url: "http://127.0.0.1:8935/r/resource-1",
              enabled: true,
              published: true,
              declaredSha256: "hash",
              servedSha256: "hash",
              status: "verified",
              servedOk: true,
              requestCount: 0,
            },
          ],
        }),
      ).state,
    ).toBe("healthy");
  });
});
