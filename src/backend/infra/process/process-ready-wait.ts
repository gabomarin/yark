import type { ServerProfile, ServerStatus } from "@shared/types";
import { rconExec } from "../rcon/rcon-client";
import {
  RCON_PROBE_TIMEOUT_MS,
  formatReadyBootWaitMessage,
  formatReadyProbeStartMessage,
  formatReadySettleMessage,
  formatReadySuccessMessage,
  formatReadyTimeoutError,
  formatReattachReadyWaitMessage,
  hasReadyLogLine,
  shouldDelayRconProbe,
} from "./process-readiness";

const RCON_HOST = "127.0.0.1";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Minimal managed-process fields mutated by the readiness wait loop. */
export interface ReadyWaitManaged {
  status: ServerStatus;
  lastError: string | null;
  startedAt: string;
  readinessGeneration: number;
}

export interface ReadyWaitTiming {
  timeoutMs: number;
  pollMs: number;
  probeMinWaitMs: number;
  settleMs: number;
}

export interface ReadyWaitHost {
  getManaged(serverId: string): ReadyWaitManaged | undefined;
  getRuntimeLogLines(serverId: string): readonly string[];
  appendRuntimeLog(serverId: string, source: string, message: string): void;
  emitStatus(serverId: string): void;
  clearProcessCheckpoint(serverId: string): void;
  /** Terminate the managed process this wait was started for. */
  terminateManaged(serverId: string): Promise<void>;
}

function isSameStartingGeneration(
  current: ReadyWaitManaged | undefined,
  managed: ReadyWaitManaged,
  generation: number,
): boolean {
  return (
    current === managed
    && managed.status === "starting"
    && managed.readinessGeneration === generation
  );
}

function hasReadyLogSignal(lines: readonly string[]): boolean {
  return hasReadyLogLine(lines);
}

/**
 * Poll RCON (and optional settle) until the managed process is ready, times
 * out, or the readiness generation is cancelled.
 */
export async function waitUntilReady(
  host: ReadyWaitHost,
  profile: Pick<ServerProfile, "id" | "rconPort" | "adminPassword">,
  managed: ReadyWaitManaged,
  generation: number,
  timing: ReadyWaitTiming,
  options?: { terminateOnTimeout?: boolean },
): Promise<void> {
  const { timeoutMs, pollMs, probeMinWaitMs, settleMs } = timing;
  const deadline = Date.now() + timeoutMs;
  const terminateOnTimeout = options?.terminateOnTimeout !== false;
  let loggedReattachWait = false;
  let loggedWaitingForBoot = false;
  let loggedProbeStart = false;
  const bootStartedAt = Date.parse(managed.startedAt) || Date.now();

  for (;;) {
    if (
      !isSameStartingGeneration(
        host.getManaged(profile.id),
        managed,
        generation,
      )
    ) {
      return;
    }

    const sawLogSignal = hasReadyLogSignal(host.getRuntimeLogLines(profile.id));
    const elapsedMs = Date.now() - bootStartedAt;
    const mayProbe = !shouldDelayRconProbe({
      sawLogSignal,
      elapsedMs,
      minWaitMs: probeMinWaitMs,
    });

    if (!mayProbe) {
      if (!loggedWaitingForBoot) {
        loggedWaitingForBoot = true;
        host.appendRuntimeLog(
          profile.id,
          "system",
          formatReadyBootWaitMessage(probeMinWaitMs),
        );
      }
      await delay(pollMs);
      continue;
    }

    if (sawLogSignal && !loggedProbeStart) {
      host.appendRuntimeLog(
        profile.id,
        "system",
        formatReadyProbeStartMessage(true),
      );
    } else if (!loggedProbeStart) {
      host.appendRuntimeLog(
        profile.id,
        "system",
        formatReadyProbeStartMessage(false),
      );
    }
    loggedProbeStart = true;

    try {
      await rconExec(
        RCON_HOST,
        profile.rconPort,
        profile.adminPassword,
        "ListPlayers",
        RCON_PROBE_TIMEOUT_MS,
        { quiet: true },
      );
      if (
        !isSameStartingGeneration(
          host.getManaged(profile.id),
          managed,
          generation,
        )
      ) {
        return;
      }

      if (settleMs > 0) {
        host.appendRuntimeLog(
          profile.id,
          "system",
          formatReadySettleMessage(settleMs),
        );
        const settleDeadline = Date.now() + settleMs;
        while (Date.now() < settleDeadline) {
          if (
            !isSameStartingGeneration(
              host.getManaged(profile.id),
              managed,
              generation,
            )
          ) {
            return;
          }
          await delay(Math.min(pollMs, settleDeadline - Date.now()));
        }
        if (
          !isSameStartingGeneration(
            host.getManaged(profile.id),
            managed,
            generation,
          )
        ) {
          return;
        }
        await rconExec(
          RCON_HOST,
          profile.rconPort,
          profile.adminPassword,
          "ListPlayers",
          RCON_PROBE_TIMEOUT_MS,
          { quiet: true },
        );
        if (
          !isSameStartingGeneration(
            host.getManaged(profile.id),
            managed,
            generation,
          )
        ) {
          return;
        }
      }

      managed.status = "running";
      managed.lastError = null;
      host.appendRuntimeLog(
        profile.id,
        "system",
        formatReadySuccessMessage(),
      );
      host.emitStatus(profile.id);
      return;
    } catch {
      // keep trying until timeout, process exit, or (reattach) forever
    }

    if (Date.now() >= deadline) {
      if (
        !isSameStartingGeneration(
          host.getManaged(profile.id),
          managed,
          generation,
        )
      ) {
        return;
      }
      if (!terminateOnTimeout) {
        if (!loggedReattachWait) {
          loggedReattachWait = true;
          host.appendRuntimeLog(
            profile.id,
            "warning",
            formatReattachReadyWaitMessage(),
          );
        }
        await delay(pollMs);
        continue;
      }

      managed.status = "error";
      managed.lastError = formatReadyTimeoutError();
      host.appendRuntimeLog(profile.id, "error", managed.lastError);
      host.clearProcessCheckpoint(profile.id);
      host.emitStatus(profile.id);
      try {
        await host.terminateManaged(profile.id);
      } catch {
        // ignore
      }
      return;
    }

    await delay(pollMs);
  }
}
