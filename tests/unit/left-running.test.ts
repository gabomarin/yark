import { describe, expect, it } from "vitest";
import {
  classifyLeaveCandidate,
  commandLinesCompatible,
  LEFT_RUNNING_SCHEMA_VERSION,
  parseLeftRunningProcesses,
  type LeftRunningProcessIdentity,
} from "@shared/left-running";

function makeRecord(
  overrides: Partial<LeftRunningProcessIdentity> = {},
): LeftRunningProcessIdentity {
  return {
    schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
    serverId: "srv-1",
    pid: 4242,
    executablePath: "C:\\ARK\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
    installDir: "C:\\ARK",
    startedAt: "2026-07-31T12:00:00.000Z",
    expectedCommandLine:
      '"C:\\ARK\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe" "TheIsland_WP"?SessionName="Test" -port=7777',
    launchArgs: ['"TheIsland_WP"?SessionName="Test"', "-port=7777"],
    osCreationTime: "20260731120000.000000-420",
    osExecutablePath: "C:\\ARK\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
    leftAt: "2026-07-31T12:05:00.000Z",
    ...overrides,
  };
}

describe("left-running identity", () => {
  it("parses durable leave records from JSON", () => {
    const record = makeRecord({
      runtimePorts: { gamePort: 7787, queryPort: 27025, rconPort: 27030 },
    });
    const parsed = parseLeftRunningProcesses(JSON.stringify([record]));
    expect(parsed).toEqual([record]);
  });

  it("keeps older leave rows without runtimePorts", () => {
    const legacy = makeRecord();
    delete legacy.runtimePorts;
    const parsed = parseLeftRunningProcesses(JSON.stringify([legacy]));
    expect(parsed).toEqual([legacy]);
    expect(parsed[0]?.runtimePorts).toBeUndefined();
  });

  it("drops invalid runtimePorts without rejecting the leave row", () => {
    const parsed = parseLeftRunningProcesses(
      JSON.stringify([
        {
          ...makeRecord(),
          runtimePorts: { gamePort: 7787, queryPort: 7787, rconPort: 27030 },
        },
      ]),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.runtimePorts).toBeUndefined();
  });

  it("rejects invalid or wrong-schema payloads", () => {
    expect(parseLeftRunningProcesses("not-json")).toEqual([]);
    expect(parseLeftRunningProcesses(JSON.stringify([{ schemaVersion: 99 }]))).toEqual(
      [],
    );
    expect(
      parseLeftRunningProcesses(JSON.stringify([makeRecord({ pid: -1 })])),
    ).toEqual([]);
  });

  it("matches when creation time agrees even if command line quoting differs", () => {
    const record = makeRecord();
    expect(
      classifyLeaveCandidate(record, {
        pid: record.pid,
        executablePath: record.executablePath,
        commandLine: "C:\\ARK\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe DIFFERENT",
        osCreationTime: record.osCreationTime,
      }),
    ).toBe("match");
  });

  it("rejects stale PID reuse when creation time differs", () => {
    const record = makeRecord();
    expect(
      classifyLeaveCandidate(record, {
        pid: record.pid,
        executablePath: record.executablePath,
        commandLine: record.expectedCommandLine,
        osCreationTime: "20260731129999.000000-420",
      }),
    ).toBe("stale_pid");
  });

  it("rejects mismatched executable path", () => {
    const record = makeRecord();
    expect(
      classifyLeaveCandidate(record, {
        pid: record.pid,
        executablePath: "C:\\Other\\ArkAscendedServer.exe",
        commandLine: record.expectedCommandLine,
        osCreationTime: record.osCreationTime,
      }),
    ).toBe("mismatched");
  });

  it("reports missing when the process is gone", () => {
    expect(classifyLeaveCandidate(makeRecord(), null)).toBe("missing");
  });

  it("rejects exe-only match when creation time is missing", () => {
    expect(
      classifyLeaveCandidate(makeRecord({ osCreationTime: null }), {
        pid: 4242,
        executablePath: makeRecord().executablePath,
        commandLine: makeRecord().expectedCommandLine,
        osCreationTime: null,
      }),
    ).toBe("inaccessible");
  });

  it("treats inaccessible when only a bare PID is available", () => {
    expect(
      classifyLeaveCandidate(
        makeRecord({ osCreationTime: null, osExecutablePath: null }),
        {
          pid: 4242,
          executablePath: null,
          commandLine: null,
          osCreationTime: null,
        },
      ),
    ).toBe("inaccessible");
  });

  it("compares command lines loosely for quote differences", () => {
    expect(
      commandLinesCompatible(
        '"C:\\ARK\\ArkAscendedServer.exe" -port=7777',
        "C:\\ARK\\ArkAscendedServer.exe -port=7777",
      ),
    ).toBe(true);
  });
});
