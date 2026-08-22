import { describe, expect, it } from "vitest";
import {
  applySessionPortsToProfile,
  buildFleetInspectKey,
  shouldInspectFleetInstallations,
  validateSessionPorts,
} from "@backend/domains/instances/instance-profile";

const profile = {
  id: "srv-1",
  installDir: "C:/ARK/Island",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
} as const;

describe("validateSessionPorts", () => {
  it("rejects invalid or duplicate ports", () => {
    expect(() =>
      validateSessionPorts({ gamePort: 7777, queryPort: 7777, rconPort: 27020 }),
    ).toThrow(/distinct/);
  });
});

describe("applySessionPortsToProfile", () => {
  it("overrides session ports on a copy", () => {
    const next = applySessionPortsToProfile(profile as never, {
      gamePort: 7780,
      queryPort: 27025,
      rconPort: 27030,
    });
    expect(next.gamePort).toBe(7780);
    expect(next.rconPort).toBe(27030);
  });
});

describe("fleet inspect helpers", () => {
  it("builds a stable inspect key", () => {
    expect(buildFleetInspectKey([profile as never], false)).toContain("srv-1");
  });

  it("decides when fleet inspection is needed", () => {
    expect(
      shouldInspectFleetInstallations({
        forceOfficialCheck: false,
        serversMode: "when-official-changed",
        officialChanged: true,
        serverSetChanged: false,
      }),
    ).toBe(true);
  });
});
