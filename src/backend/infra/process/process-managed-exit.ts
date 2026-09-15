import type { AsaStartupFailure } from "@shared/asa/asa-startup-failure";
import { diagnoseAsaStartupFailure } from "@shared/asa/asa-startup-failure";
import {
  readAsaLogSessionExcerpt,
  type AsaLogSessionAnchor,
} from "./asa-log-tail";
import {
  formatProcessExitLogLine,
  isOperatorClosedExit,
  isOperatorClosedManagedPhase,
  isUnexpectedManagedExit,
  OPERATOR_CLOSED_NOTICE,
  planManagedExitLastError,
  type OperatorClosedExit,
} from "./process-stop";

export interface ManagedExitProcess {
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  lastError: string | null;
  readinessGeneration: number;
  logTailer: { stop(): void } | null;
  installDir: string;
  logSessionAnchor: AsaLogSessionAnchor;
}

export interface ManagedExitHost {
  getManaged(serverId: string): ManagedExitProcess | undefined;
  flushRuntimePartials(serverId: string): void;
  appendRuntimeLog(serverId: string, source: string, message: string): void;
  clearProcessCheckpoint(serverId: string): void;
  getRuntimeLogSnapshot(serverId: string, limit?: number): string[];
  deleteManagedUnlessError(serverId: string, managed: ManagedExitProcess): void;
  emitOperatorClosed(payload: OperatorClosedExit): void;
  emitUnexpectedExit(payload: {
    serverId: string;
    exitCode: number | null;
    phase: "starting" | "running";
    lastError: string;
    diagnosis: AsaStartupFailure | null;
  }): void;
  emitStatus(serverId: string): void;
}

/** Shared exit path for managed ASA children (clean stop, operator-closed, crash). */
export function handleManagedProcessExit(
  host: ManagedExitHost,
  serverId: string,
  managed: ManagedExitProcess,
  code: number | null,
): void {
  const wasStopping = managed.status === "stopping";
  const wasStarting = managed.status === "starting";
  const wasRunning = managed.status === "running";
  managed.readinessGeneration += 1;
  managed.logTailer?.stop();
  managed.logTailer = null;
  if (host.getManaged(serverId) !== managed) return;
  host.flushRuntimePartials(serverId);
  host.appendRuntimeLog(serverId, "system", formatProcessExitLogLine(code));
  host.clearProcessCheckpoint(serverId);
  const unexpected = isUnexpectedManagedExit({
    wasStopping,
    wasStarting,
    wasRunning,
    exitCode: code,
  });
  if (!unexpected) {
    if (
      isOperatorClosedManagedPhase(wasStarting, wasRunning)
      && isOperatorClosedExit(code)
    ) {
      managed.status = "stopped";
      managed.lastError = OPERATOR_CLOSED_NOTICE;
      host.appendRuntimeLog(serverId, "system", OPERATOR_CLOSED_NOTICE);
      host.emitOperatorClosed({
        serverId,
        exitCode: code,
        phase: wasStarting ? "starting" : "running",
      });
      host.emitStatus(serverId);
      return;
    }
    host.deleteManagedUnlessError(serverId, managed);
    host.emitStatus(serverId);
    return;
  }

  const diagnosis = diagnoseAsaStartupFailure(
    [
      host.getRuntimeLogSnapshot(serverId, 400).join("\n"),
      readAsaLogSessionExcerpt(managed.installDir, managed.logSessionAnchor),
    ].join("\n"),
  );
  if (diagnosis !== null) {
    host.appendRuntimeLog(serverId, "error", diagnosis.summary);
    for (const line of diagnosis.excerpt.split("\n")) {
      host.appendRuntimeLog(serverId, "log", line);
    }
  }
  managed.status = "error";
  managed.lastError = planManagedExitLastError({
    wasStarting,
    exitCode: code,
    diagnosisSummary: diagnosis?.summary ?? null,
  });
  host.emitUnexpectedExit({
    serverId,
    exitCode: code,
    phase: wasStarting ? "starting" : "running",
    lastError: managed.lastError,
    diagnosis,
  });
  host.emitStatus(serverId);
}
