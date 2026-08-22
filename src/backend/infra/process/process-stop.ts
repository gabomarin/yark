export function isUnexpectedManagedExit(input: {
  wasStopping: boolean;
  wasStarting: boolean;
  wasRunning: boolean;
  exitCode: number | null;
}): boolean {
  return (
    !input.wasStopping
    && (input.wasStarting || (input.wasRunning && input.exitCode !== 0))
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
  return input.wasStarting
    ? `Process exited during startup (code ${input.exitCode ?? "unknown"})`
    : `Process exited unexpectedly (code ${input.exitCode ?? "unknown"})`;
}

export const SAVE_WAIT_MS = 8000;
export const EXIT_WAIT_MS = 30000;
