import type { MaintenancePolicy, MaintenancePolicyStatus } from "@shared/types";
import type { MaintenanceRepository } from "../../infra/db/maintenance-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { InstanceService } from "../instances/instance-service";
import { MaintenanceRestartRuntime } from "./maintenance-restart-runtime";

/**
 * Maintenance policies + scheduled restart countdown (#486 / #487).
 * Wipe / Steam-newer execution lands in #488–#489.
 */
export class MaintenanceService {
  private readonly restartRuntime: MaintenanceRestartRuntime;

  constructor(
    private readonly repo: MaintenanceRepository,
    private readonly servers: ServerRepository,
    processes: ProcessManager,
    instances: InstanceService,
  ) {
    this.restartRuntime = new MaintenanceRestartRuntime(
      repo,
      servers,
      processes,
      instances,
    );
  }

  getPolicy(serverId: string): MaintenancePolicyStatus {
    return this.restartRuntime.enrichStatus(this.repo.getPolicy(serverId));
  }

  setPolicy(
    serverId: string,
    patch: Omit<MaintenancePolicy, "serverId" | "updatedAt">,
  ): MaintenancePolicyStatus {
    if (this.servers.get(serverId) === null) {
      throw new Error("Server does not exist");
    }
    let restartEnabled = patch.restartEnabled;
    let wipeEnabled = patch.wipeEnabled;
    if (!restartEnabled) {
      wipeEnabled = false;
    } else if (wipeEnabled) {
      restartEnabled = true;
    }
    this.repo.setPolicy({
      serverId,
      ...patch,
      restartEnabled,
      wipeEnabled,
    });
    return this.getPolicy(serverId);
  }

  clearSchedulePause(serverId: string): MaintenancePolicyStatus {
    this.restartRuntime.clearSchedulePause(serverId);
    return this.getPolicy(serverId);
  }

  async runRestartNow(serverId: string): Promise<MaintenancePolicyStatus> {
    return this.restartRuntime.runRestartNow(serverId);
  }

  cancelUpcoming(serverId: string): MaintenancePolicyStatus {
    return this.restartRuntime.cancelUpcoming(serverId);
  }

  async runScheduledCycle(): Promise<void> {
    await this.restartRuntime.runScheduledCycle();
  }
}
