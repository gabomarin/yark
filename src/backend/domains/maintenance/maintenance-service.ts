import type { MaintenancePolicy, MaintenancePolicyStatus } from "@shared/types";
import type { MaintenanceRepository } from "../../infra/db/maintenance-repository";
import type { ServerRepository } from "../../infra/db/server-repository";

/**
 * Maintenance policies + idle scheduler cycle (#486).
 * Disruptive jobs land in #487–#489; this service persists flags and ticks safely.
 */
export class MaintenanceService {
  /** Session-only fail-streak pause (mirrors world backup schedule). */
  private readonly pausedServerIds = new Set<string>();

  constructor(
    private readonly repo: MaintenanceRepository,
    private readonly servers: ServerRepository,
  ) {}

  getPolicy(serverId: string): MaintenancePolicyStatus {
    const policy = this.repo.getPolicy(serverId);
    return {
      ...policy,
      schedulePaused: this.pausedServerIds.has(serverId),
    };
  }

  setPolicy(
    serverId: string,
    patch: Omit<MaintenancePolicy, "serverId" | "updatedAt">,
  ): MaintenancePolicy {
    if (this.servers.get(serverId) === null) {
      throw new Error("Server does not exist");
    }
    // Wipe On requires a restart schedule. Restart Off always clears wipe so
    // the operator can turn the restart toggle off without the wipe flag
    // re-arming restart on save.
    let restartEnabled = patch.restartEnabled;
    let wipeEnabled = patch.wipeEnabled;
    if (!restartEnabled) {
      wipeEnabled = false;
    } else if (wipeEnabled) {
      restartEnabled = true;
    }
    return this.repo.setPolicy({
      serverId,
      ...patch,
      restartEnabled,
      wipeEnabled,
    });
  }

  clearSchedulePause(serverId: string): MaintenancePolicyStatus {
    this.pausedServerIds.delete(serverId);
    return this.getPolicy(serverId);
  }

  /**
   * Idle tick: walk known policies; no disruptive work in slice 1.
   * Later slices enqueue restart / wipe / update from here.
   */
  async runScheduledCycle(): Promise<void> {
    const policies = this.repo.listPolicies();
    for (const policy of policies) {
      if (this.pausedServerIds.has(policy.serverId)) continue;
      if (!policy.restartEnabled && !policy.wipeEnabled && !policy.updateEnabled) {
        continue;
      }
      // Slice 1: armed policies are acknowledged with no side effects.
      void policy.serverId;
    }
  }
}
