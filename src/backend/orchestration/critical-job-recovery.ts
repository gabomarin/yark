import { randomUUID } from "node:crypto";
import type {
  CriticalJobNextAction,
  CriticalJobOperation,
  CriticalJobStatus,
  CriticalJobSummary,
} from "../../shared/types";

export interface DurableCriticalJob {
  id: string;
  type: CriticalJobOperation;
  serverId: string;
  attempts: number;
  maxAttempts: number;
  status: CriticalJobStatus;
  phase: string;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  recoveryReason: string | null;
  idempotencyKey: string;
  operatorRetryAllowed: boolean;
}

const TRANSIENT_ERROR =
  /timed?\s*out|temporar(?:y|ily) unavailable|connection (?:reset|refused|closed)|network (?:error|failure)|econnreset|econnrefused|etimedout|eai_again|ebusy|resource busy/i;

export function isTransientCriticalJobError(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "").toUpperCase()
      : "";
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "EBUSY"].includes(code)) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_ERROR.test(message);
}

export function nextActionsForStatus(
  status: CriticalJobStatus,
  operatorRetryAllowed = true,
): CriticalJobNextAction[] {
  if (status === "blocked" || status === "failed") {
    return operatorRetryAllowed ? ["retry", "dismiss"] : ["dismiss"];
  }
  if (status === "pending" || status === "retrying") return ["cancel"];
  if (status === "cancelled") return ["dismiss"];
  return [];
}

export function toCriticalJobSummary(
  job: DurableCriticalJob,
  serverName?: string | null,
): CriticalJobSummary {
  return {
    id: job.id,
    operation: job.type,
    serverId: job.serverId,
    serverName,
    status: job.status,
    phase: job.phase,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    lastError: job.lastError,
    recoveryReason: job.recoveryReason,
    nextActions: nextActionsForStatus(job.status, job.operatorRetryAllowed),
  };
}

export function makeIdempotencyKey(
  type: CriticalJobOperation,
  serverId: string,
  discriminator?: string | null,
): string {
  return [type, serverId, discriminator ?? ""].join(":");
}

export function migrateCriticalJob<T extends DurableCriticalJob>(
  raw: Partial<T>,
  options: {
    type: CriticalJobOperation;
    serverId: string;
    defaultPhase: string;
    interruptedIsAmbiguous: boolean;
    idempotencyDiscriminator?: string | null;
    serverExists: boolean;
  },
): T {
  const now = new Date().toISOString();
  const priorStatus = raw.status;
  const wasInterrupted = priorStatus === "running";
  let status: CriticalJobStatus =
    priorStatus === "pending"
    || priorStatus === "retrying"
    || priorStatus === "blocked"
    || priorStatus === "failed"
    || priorStatus === "cancelled"
      ? priorStatus
      : "pending";
  let recoveryReason = typeof raw.recoveryReason === "string" ? raw.recoveryReason : null;

  if (!options.serverExists) {
    status = "failed";
    recoveryReason = "The referenced server profile no longer exists.";
  } else if (wasInterrupted && options.interruptedIsAmbiguous) {
    status = "blocked";
    recoveryReason = `The app stopped during phase "${raw.phase ?? options.defaultPhase}". The outcome is ambiguous and requires operator review.`;
  } else if (wasInterrupted || priorStatus === "retrying") {
    status = "pending";
    recoveryReason = `Recovered after application restart from phase "${raw.phase ?? options.defaultPhase}".`;
  }

  return {
    ...raw,
    id: typeof raw.id === "string" ? raw.id : randomUUID(),
    type: options.type,
    serverId: options.serverId,
    attempts: Number.isFinite(raw.attempts) ? Math.max(0, Math.floor(raw.attempts!)) : 0,
    maxAttempts: Number.isFinite(raw.maxAttempts)
      ? Math.max(1, Math.floor(raw.maxAttempts!))
      : 3,
    status,
    phase: typeof raw.phase === "string" ? raw.phase : options.defaultPhase,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    recoveryReason,
    idempotencyKey:
      typeof raw.idempotencyKey === "string"
        ? raw.idempotencyKey
        : makeIdempotencyKey(
            options.type,
            options.serverId,
            options.idempotencyDiscriminator,
          ),
    operatorRetryAllowed:
      !options.serverExists
        ? false
        : status === "blocked"
          ? true
        : typeof raw.operatorRetryAllowed === "boolean"
          ? raw.operatorRetryAllowed
          : status === "failed",
  } as T;
}
