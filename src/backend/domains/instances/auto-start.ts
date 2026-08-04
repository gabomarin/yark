import type { LeaveReattachOutcome } from "@backend/infra/process/left-running-reattach";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile } from "@shared/types";

export type AutoStartSkipReason =
  | "inactive"
  | "already_running"
  | "reattach_uncertain";

export type AutoStartResult =
  | { serverId: string; name: string; outcome: "started" }
  | {
      serverId: string;
      name: string;
      outcome: "skipped";
      reason: AutoStartSkipReason;
      detail: string;
    }
  | {
      serverId: string;
      name: string;
      outcome: "failed";
      detail: string;
    };

export interface AutoStartStartFn {
  (serverId: string): Promise<void>;
}

export interface RunAutoStartOptions {
  /** Profiles to evaluate (typically repo.list()). */
  profiles: ServerProfile[];
  /** Outcomes from #59 reattach scan (may be empty). */
  reattachOutcomes?: LeaveReattachOutcome[];
  processes: Pick<ProcessManager, "isActive">;
  repo: Pick<ServerRepository, "addEvent">;
  start: AutoStartStartFn;
}

function uncertainReattachIds(
  outcomes: LeaveReattachOutcome[] | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (outcomes === undefined) {
    return ids;
  }
  for (const outcome of outcomes) {
    // Keep inaccessible checkpoints for retry — do not spawn a duplicate.
    if (outcome.classification === "inaccessible" && !outcome.reattached) {
      ids.add(outcome.serverId);
    }
  }
  return ids;
}

/**
 * After leave-running reattach (#59): start each opted-in, enabled profile
 * that is not already managed / uncertain. Sequential; failures are isolated.
 *
 * Concurrency: 1 (documented). Always call `start` so InstanceService guards apply.
 */
export async function runAutoStartOnLaunch(
  options: RunAutoStartOptions,
): Promise<AutoStartResult[]> {
  const uncertain = uncertainReattachIds(options.reattachOutcomes);
  const results: AutoStartResult[] = [];

  // Only evaluate opted-in profiles; others stay silent (no event noise).
  const candidates = options.profiles.filter((profile) => profile.autoStart);

  for (const profile of candidates) {
    const result = await evaluateAndMaybeStart(profile, {
      uncertain,
      processes: options.processes,
      repo: options.repo,
      start: options.start,
    });
    results.push(result);
  }

  return results;
}

async function evaluateAndMaybeStart(
  profile: ServerProfile,
  ctx: {
    uncertain: Set<string>;
    processes: Pick<ProcessManager, "isActive">;
    repo: Pick<ServerRepository, "addEvent">;
    start: AutoStartStartFn;
  },
): Promise<AutoStartResult> {
  if (!profile.enabled) {
    return skip(
      profile,
      "inactive",
      `Auto-start skipped for "${profile.name}": profile is Inactive`,
      ctx.repo,
    );
  }

  if (ctx.processes.isActive(profile.id)) {
    return skip(
      profile,
      "already_running",
      `Auto-start skipped for "${profile.name}": already running or reattached`,
      ctx.repo,
    );
  }

  if (ctx.uncertain.has(profile.id)) {
    return skip(
      profile,
      "reattach_uncertain",
      `Auto-start skipped for "${profile.name}": left-running process identity is uncertain — resolve before starting`,
      ctx.repo,
    );
  }

  try {
    await ctx.start(profile.id);
    ctx.repo.addEvent(
      profile.id,
      "auto_start_succeeded",
      "info",
      `Auto-start launched "${profile.name}"`,
      {
        what: "Opt-in auto-start launched this server at application launch.",
        context: { reason: "started" },
      },
    );
    return {
      serverId: profile.id,
      name: profile.name,
      outcome: "started",
    };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    ctx.repo.addEvent(
      profile.id,
      "auto_start_failed",
      "error",
      `Auto-start failed for "${profile.name}": ${detail}`,
      {
        what: "Opt-in auto-start could not launch this server.",
        cause: detail,
        context: { reason: "start_rejected" },
      },
    );
    return {
      serverId: profile.id,
      name: profile.name,
      outcome: "failed",
      detail,
    };
  }
}

function skip(
  profile: ServerProfile,
  reason: AutoStartSkipReason,
  message: string,
  repo: Pick<ServerRepository, "addEvent">,
): AutoStartResult {
  repo.addEvent(profile.id, "auto_start_skipped", "info", message, {
    context: { reason },
  });
  return {
    serverId: profile.id,
    name: profile.name,
    outcome: "skipped",
    reason,
    detail: message,
  };
}
