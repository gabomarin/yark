import {
  OS_NOTIFY_CRASH_EVENT_TYPE,
  type ServerCrashedNotifyPayload,
} from "@shared/os-notification-events";
import type { AsaStartupFailure } from "@shared/asa-startup-failure";
import { sanitizeDiagnosticText } from "@shared/credential-redaction";

export interface UnexpectedServerCrashPayload {
  serverId: string;
  exitCode: number | null;
  phase: "starting" | "running";
  lastError: string;
  diagnosis: AsaStartupFailure | null;
}

export function planUnexpectedServerCrashEvent(input: {
  payload: UnexpectedServerCrashPayload;
  serverName: string;
  knownSecrets?: readonly string[];
}): {
  eventType: typeof OS_NOTIFY_CRASH_EVENT_TYPE;
  severity: "error";
  summary: string;
  details: {
    what: string;
    cause?: string;
    location: string;
    suggestion?: string;
    excerpt?: string;
    context: {
      lastError: string;
      phase: "starting" | "running";
      exitCode: number | null;
      missingModIds: string | null;
    };
  };
  notify: ServerCrashedNotifyPayload;
} {
  const diagnosis: AsaStartupFailure | null = input.payload.diagnosis;
  const summary =
    diagnosis?.summary
    ?? input.payload.lastError
    ?? `Server "${input.serverName}" exited unexpectedly`;
  const secrets = input.knownSecrets ?? [];
  const excerpt = sanitizeDiagnosticText(
    diagnosis?.excerpt?.trim() ?? "",
    secrets,
  ).trim();
  const safeSummary = sanitizeDiagnosticText(summary, secrets);
  return {
    eventType: OS_NOTIFY_CRASH_EVENT_TYPE,
    severity: "error",
    summary: safeSummary,
    details: {
      what: safeSummary,
      cause: diagnosis?.cause,
      location: "ShooterGame/Saved/Logs/ShooterGame.log",
      suggestion: diagnosis?.suggestion,
      excerpt: excerpt.length > 0 ? excerpt : undefined,
      context: {
        lastError: sanitizeDiagnosticText(input.payload.lastError, secrets),
        phase: input.payload.phase,
        exitCode: input.payload.exitCode,
        missingModIds:
          diagnosis !== null && diagnosis.missingModIds.length > 0
            ? diagnosis.missingModIds.join(",")
            : null,
      },
    },
    notify: {
      serverId: input.payload.serverId,
      serverName: input.serverName,
      eventId: 0,
      summary: safeSummary,
    },
  };
}
