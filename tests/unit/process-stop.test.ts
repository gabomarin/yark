import { describe, expect, it } from "vitest";
import {
  formatProcessExitLogLine,
  isOperatorClosedExit,
  isUnexpectedManagedExit,
  planManagedExitLastError,
} from "@backend/infra/process/process-stop";

describe("process-stop helpers", () => {
  it("classifies unexpected managed exits", () => {
    expect(
      isUnexpectedManagedExit({
        wasStopping: false,
        wasStarting: true,
        wasRunning: false,
        exitCode: 0,
      }),
    ).toBe(true);
    expect(
      isUnexpectedManagedExit({
        wasStopping: true,
        wasStarting: true,
        wasRunning: false,
        exitCode: 0,
      }),
    ).toBe(false);
  });

  it("treats operator-closed exit codes as clean stops while starting or running", () => {
    const controlC = 0xc000013a;
    const endTask = 0x40010004;
    const controlBreak = 0x40010005;
    // Node may surface NTSTATUS as a signed Int32.
    const controlCSigned = controlC | 0;

    expect(isOperatorClosedExit(controlC)).toBe(true);
    expect(isOperatorClosedExit(controlCSigned)).toBe(true);
    expect(isOperatorClosedExit(endTask)).toBe(true);
    expect(isOperatorClosedExit(controlBreak)).toBe(true);
    expect(isOperatorClosedExit(1)).toBe(false);
    expect(isOperatorClosedExit(null)).toBe(false);

    expect(
      isUnexpectedManagedExit({
        wasStopping: false,
        wasStarting: false,
        wasRunning: true,
        exitCode: controlCSigned,
      }),
    ).toBe(false);
    expect(
      isUnexpectedManagedExit({
        wasStopping: false,
        wasStarting: false,
        wasRunning: true,
        exitCode: endTask,
      }),
    ).toBe(false);
    expect(
      isUnexpectedManagedExit({
        wasStopping: false,
        wasStarting: true,
        wasRunning: false,
        exitCode: controlC,
      }),
    ).toBe(false);
    expect(
      isUnexpectedManagedExit({
        wasStopping: false,
        wasStarting: false,
        wasRunning: true,
        exitCode: 1,
      }),
    ).toBe(true);
  });

  it("formats exit log and last error copy", () => {
    expect(formatProcessExitLogLine(1)).toContain("1");
    expect(
      planManagedExitLastError({
        wasStarting: true,
        exitCode: 1,
        diagnosisSummary: "Mod missing",
      }),
    ).toBe("Mod missing");
  });
});
