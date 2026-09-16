import { collectKnownSecrets } from "@shared/credential-redaction";
import type { ServerRepository } from "../../infra/db/server-repository";
import type {
  OperatorClosedExit,
  UnexpectedManagedExit,
} from "../../infra/process/process-manager";
import { OPERATOR_CLOSED_NOTICE } from "../../infra/process/process-stop";
import {
  planOperatorClosedServerEvent,
  planUnexpectedServerCrashEvent,
} from "./instance-crash";
import type { ServerCrashedNotifyPayload } from "@shared/settings/os-notification-events";
import type { DiscordClosedByUserPayload } from "@shared/settings/discord-webhook";

export function recordUnexpectedProcessExit(
  repo: Pick<ServerRepository, "get" | "list" | "addEvent">,
  payload: UnexpectedManagedExit,
  emitCrashed: (notify: ServerCrashedNotifyPayload) => void,
): void {
  const profile = repo.get(payload.serverId);
  const name = profile?.name ?? payload.serverId;
  const planned = planUnexpectedServerCrashEvent({
    payload,
    serverName: name,
    knownSecrets: collectKnownSecrets(repo.list()),
  });
  const eventId = repo.addEvent(
    payload.serverId,
    planned.eventType,
    planned.severity,
    planned.summary,
    planned.details,
  );
  emitCrashed({
    ...planned.notify,
    eventId,
  });
}

export function recordOperatorClosedExit(
  repo: Pick<ServerRepository, "get" | "addEvent">,
  payload: OperatorClosedExit,
  emitClosedByUser?: (notify: DiscordClosedByUserPayload) => void,
): void {
  const profile = repo.get(payload.serverId);
  const planned = planOperatorClosedServerEvent({
    serverId: payload.serverId,
    serverName: profile?.name ?? payload.serverId,
    phase: payload.phase,
    exitCode: payload.exitCode,
    notice: OPERATOR_CLOSED_NOTICE,
  });
  const eventId = repo.addEvent(
    payload.serverId,
    planned.eventType,
    planned.severity,
    planned.summary,
    planned.details,
  );
  emitClosedByUser?.({
    serverId: payload.serverId,
    serverName: profile?.name ?? payload.serverId,
    eventId,
  });
}
