import { OS_NOTIFY_CRASH_EVENT_TYPE, type ServerCrashedNotifyPayload } from "@shared/settings/os-notification-events";
import type { AsaStartupFailure } from "@shared/asa/asa-startup-failure";
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
  const summary = diagnosis?.summary ?? input.payload.lastError ?? `Server "${input.serverName}" exited unexpectedly`;
  const secrets = input.knownSecrets ?? [];
  const excerpt = sanitizeDiagnosticText(diagnosis?.excerpt?.trim() ?? "", secrets).trim();
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
          diagnosis !== null && diagnosis.missingModIds.length > 0 ? diagnosis.missingModIds.join(",") : null,
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

export function planOperatorClosedServerEvent(input: {
  serverId: string;
  serverName: string;
  phase: "starting" | "running";
  exitCode: number | null;
  notice: string;
}): {
  eventType: "server_stopped";
  severity: "warning";
  summary: string;
  details: {
    what: string;
    cause: string;
    suggestion: string;
    context: {
      phase: "starting" | "running";
      exitCode: number | null;
    };
  };
} {
  return {
    eventType: "server_stopped",
    severity: "warning",
    summary: `Server "${input.serverName}" ${input.notice.toLowerCase()}`,
    details: {
      what: "The server console window was closed by the operator.",
      cause: "Console close, Ctrl+C/Break, or Task Manager End task while YARK still managed the process.",
      suggestion: "Start the server again from Overview when you are ready.",
      context: {
        phase: input.phase,
        exitCode: input.exitCode,
      },
    },
  };
}
