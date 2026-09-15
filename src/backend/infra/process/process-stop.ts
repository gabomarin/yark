const OPERATOR_CLOSED_EXIT_CODES = new Set([0xc000013a, 0x40010004, 0x40010005]);

export function isOperatorClosedExit(exitCode: number | null): boolean {
  if (exitCode === null) return false;
  // Node may report negative numbers for large unsigned NTSTATUS codes.
  return OPERATOR_CLOSED_EXIT_CODES.has(exitCode >>> 0);
}

export function isUnexpectedManagedExit(input: {
  wasStopping: boolean;
  wasStarting: boolean;
  wasRunning: boolean;
  exitCode: number | null;
}): boolean {
  return (
    !input.wasStopping
    && (input.wasStarting || (input.wasRunning && !isOperatorClosedExit(input.exitCode) && input.exitCode !== 0))
  );
}

export function formatProcessExitLogLine(exitCode: number | null): string {
  return `Process exited with code ${exitCode ?? "unknown"}`;
}

export function planManagedExitLastError(input: {
  wasStarting: boolean;
  exitCode: number | null;
  diagnosisSummary: string | null;
}): string {
  if (input.diagnosisSummary !== null) {
    return input.diagnosisSummary;
  }
  if (!input.wasStarting && isOperatorClosedExit(input.exitCode)) {
    return `Process was closed by the operator (code ${input.exitCode ?? "unknown"})`;
  }
  return input.wasStarting
    ? `Process exited during startup (code ${input.exitCode ?? "unknown"})`
    : `Process exited unexpectedly (code ${input.exitCode ?? "unknown"})`;
}

export const SAVE_WAIT_MS = 8000;
export const EXIT_WAIT_MS = 30000;
