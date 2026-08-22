import { describe, expect, it } from "vitest";
import {
  formatProcessExitLogLine,
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
