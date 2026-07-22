import type {
  ClusterComplianceReport,
  ServerProfile,
  ServerProfileInput,
  ServerRuntimeInfo,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import { findPortConflicts, validateProfileInput } from "./validation";
import { checkClusterCompliance } from "../cluster/compliance";
import { rconExec } from "../../infra/rcon/rcon-client";

const RCON_HOST = "127.0.0.1";

/**
 * Servicio de orquestación de instancias: CRUD validado + ciclo de vida.
 */
export class InstanceService {
  constructor(
    private readonly repo: ServerRepository,
    private readonly processes: ProcessManager,
  ) {}

  list(): ServerProfile[] {
    return this.repo.list();
  }

  create(input: ServerProfileInput): ServerProfile {
    this.assertValidInput(input);
    this.assertNoPortConflicts(input);
    const profile = this.repo.create(input);
    this.repo.addEvent(
      profile.id,
      "server_created",
      "info",
      `Servidor "${profile.name}" creado (mapa ${profile.map})`,
    );
    return profile;
  }

  update(id: string, input: ServerProfileInput): ServerProfile {
    if (this.processes.isActive(id)) {
      throw new Error("No se puede editar un servidor mientras está en ejecución");
    }
    this.assertValidInput(input);
    this.assertNoPortConflicts(input, id);
    const updated = this.repo.update(id, input);
    if (updated === null) {
      throw new Error("El servidor no existe");
    }
    this.repo.addEvent(
      id,
      "server_updated",
      "info",
      `Servidor "${updated.name}" actualizado`,
    );
    return updated;
  }

  delete(id: string): void {
    if (this.processes.isActive(id)) {
      throw new Error("No se puede eliminar un servidor mientras está en ejecución");
    }
    const profile = this.repo.get(id);
    if (profile === null) return;
    this.repo.delete(id);
    this.repo.addEvent(
      null,
      "server_deleted",
      "info",
      `Servidor "${profile.name}" eliminado`,
    );
  }

  /** Clona un perfil con nombre derivado y puertos desplazados +10. */
  clone(id: string): ServerProfile {
    const source = this.repo.get(id);
    if (source === null) {
      throw new Error("El servidor a clonar no existe");
    }
    const existing = this.repo.list();
    const names = new Set(existing.map((p) => p.name));
    let name = `${source.name} (copia)`;
    let suffix = 2;
    while (names.has(name)) {
      name = `${source.name} (copia ${suffix})`;
      suffix++;
    }

    let offset = 10;
    let input: ServerProfileInput;
    for (;;) {
      input = {
        name,
        map: source.map,
        installDir: source.installDir,
        sessionName: `${source.sessionName} (copia)`,
        gamePort: source.gamePort + offset,
        queryPort: source.queryPort + offset,
        rconPort: source.rconPort + offset,
        serverPassword: source.serverPassword,
        adminPassword: source.adminPassword,
        clusterId: source.clusterId,
        clusterDir: source.clusterDir,
        extraArgs: [...source.extraArgs],
        mods: [...source.mods],
      };
      if (findPortConflicts(existing, { ...input, id: undefined }).length === 0) {
        break;
      }
      offset += 10;
      if (offset > 1000) {
        throw new Error("No se encontraron puertos libres para el clon");
      }
    }
    return this.create(input);
  }

  start(id: string): void {
    const profile = this.mustGet(id);
    const running = this.repo
      .list()
      .filter((p) => p.id !== id && this.processes.isActive(p.id));
    const conflicts = findPortConflicts(running, { ...profile });
    if (conflicts.length > 0) {
      const c = conflicts[0]!;
      throw new Error(
        `Conflicto de puerto ${c.kind} ${c.port} con el servidor activo "${c.serverA === profile.name ? c.serverB : c.serverA}"`,
      );
    }
    this.processes.start(profile);
    this.repo.addEvent(
      id,
      "server_started",
      "info",
      `Servidor "${profile.name}" iniciado`,
    );
  }

  async stop(id: string): Promise<void> {
    const profile = this.mustGet(id);
    await this.processes.stop(profile);
    this.repo.addEvent(
      id,
      "server_stopped",
      "info",
      `Servidor "${profile.name}" detenido (con guardado previo)`,
    );
  }

  kill(id: string): void {
    const profile = this.mustGet(id);
    this.processes.kill(id);
    this.repo.addEvent(
      id,
      "server_stopped",
      "warning",
      `Servidor "${profile.name}" terminado forzosamente (sin guardado)`,
    );
  }

  statuses(): ServerRuntimeInfo[] {
    return this.processes.listStatuses(this.repo.list().map((p) => p.id));
  }

  checkClusters(): ClusterComplianceReport[] {
    return checkClusterCompliance(this.repo.list());
  }

  async sendRcon(id: string, command: string): Promise<string> {
    const profile = this.mustGet(id);
    if (!this.processes.isActive(id)) {
      throw new Error("El servidor no está en ejecución");
    }
    const response = await rconExec(
      RCON_HOST,
      profile.rconPort,
      profile.adminPassword,
      command,
    );
    this.repo.addEvent(
      id,
      "rcon_command",
      "info",
      `RCON en "${profile.name}": ${command}`,
    );
    return response;
  }

  private mustGet(id: string): ServerProfile {
    const profile = this.repo.get(id);
    if (profile === null) {
      throw new Error("El servidor no existe");
    }
    return profile;
  }

  private assertValidInput(input: ServerProfileInput): void {
    const issues = validateProfileInput(input);
    if (issues.length > 0) {
      throw new Error(
        issues.map((i) => `${i.field}: ${i.message}`).join(" | "),
      );
    }
  }

  private assertNoPortConflicts(
    input: ServerProfileInput,
    excludeId?: string,
  ): void {
    const others = this.repo
      .list()
      .filter((p) => p.id !== excludeId);
    const conflicts = findPortConflicts(others, {
      ...input,
      id: excludeId,
    });
    if (conflicts.length > 0) {
      const c = conflicts[0]!;
      throw new Error(
        `Conflicto de puerto ${c.kind} ${c.port} entre "${c.serverA}" y "${c.serverB}"`,
      );
    }
  }
}
