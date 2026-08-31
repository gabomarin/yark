import type { MaintenancePolicy, MaintenancePolicyStatus } from "@shared/types";
import type { MaintenanceRepository } from "../../infra/db/maintenance-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { InstanceService } from "../instances/instance-service";
import type { UpdateService } from "../updates/update-service";
import { MaintenanceRestartRuntime } from "./maintenance-restart-runtime";
import { MaintenanceUpdateRuntime } from "./maintenance-update-runtime";

/**
 * Maintenance policies, restart countdown (#487), wipe hook (#488 when present),
 * and Steam-newer auto-update (#489).
 */
export class MaintenanceService {
  private readonly restartRuntime: MaintenanceRestartRuntime;
  private readonly updateRuntime: MaintenanceUpdateRuntime;

  constructor(
    private readonly repo: MaintenanceRepository,
    private readonly servers: ServerRepository,
    processes: ProcessManager,
    instances: InstanceService,
    updates: UpdateService,
  ) {
    this.restartRuntime = new MaintenanceRestartRuntime(
      repo,
      servers,
      processes,
      instances,
    );
    this.updateRuntime = new MaintenanceUpdateRuntime(
      repo,
      servers,
      processes,
      instances,
      updates,
      this.restartRuntime,
    );
    this.restartRuntime.setPeerBusyCheck((serverId) =>
      this.updateRuntime.hasActiveCountdown(serverId),
    );
  }

  async getPolicy(serverId: string): Promise<MaintenancePolicyStatus> {
    this.repo.ensurePolicy(serverId);
    const base = this.restartRuntime.enrichStatus(this.repo.getPolicy(serverId));
    const steamUpdateAvailable =
      await this.updateRuntime.isSteamUpdateAvailable(serverId);
    return this.updateRuntime.mergeStatus(base, steamUpdateAvailable);
  }

  async setPolicy(
    serverId: string,
    patch: Omit<MaintenancePolicy, "serverId" | "updatedAt">,
  ): Promise<MaintenancePolicyStatus> {
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

  async clearSchedulePause(serverId: string): Promise<MaintenancePolicyStatus> {
    this.restartRuntime.clearSchedulePause(serverId);
    this.updateRuntime.clearSchedulePause(serverId);
    return this.getPolicy(serverId);
  }

  async runRestartNow(serverId: string): Promise<MaintenancePolicyStatus> {
    await this.restartRuntime.runRestartNow(serverId);
    return this.getPolicy(serverId);
  }

  async runUpdateNow(serverId: string): Promise<MaintenancePolicyStatus> {
    await this.updateRuntime.runUpdateNow(serverId);
    return this.getPolicy(serverId);
  }

  async cancelUpcoming(serverId: string): Promise<MaintenancePolicyStatus> {
    this.restartRuntime.cancelUpcoming(serverId);
    this.updateRuntime.cancelUpcoming(serverId);
    return this.getPolicy(serverId);
  }

  async runScheduledCycle(): Promise<void> {
    this.repo.ensurePoliciesForServers(this.servers.list().map((s) => s.id));
    await this.restartRuntime.runScheduledCycle();
    await this.updateRuntime.runScheduledCycle();
  }
}
