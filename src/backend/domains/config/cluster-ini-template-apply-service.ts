import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  BackupRecord,
  ClusterIniTemplate,
  ClusterIniTemplateApplyResult,
  ClusterIniTemplateMemberPreview,
  ServerIniPayload,
  ServerProfile,
  ServerStatus,
} from "@shared/types";
import type { ClusterIniTemplateRepository } from "../../infra/db/cluster-ini-template-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { BackupService } from "../backups/backup-service";
import {
  composeMemberPayloadFromTemplate,
  composeTemplatePayloadFromMember,
  finalizeClusterIniApplyPreview,
} from "./ini-compose";
import { buildIniPreview } from "./ini-preview";
import type { IniService } from "./ini-service";

export interface ServerRuntimeStatusReader {
  getStatus(serverId: string): { status: ServerStatus };
}

function normalizeClusterId(clusterId: string): string {
  const id = clusterId.trim();
  if (id.length === 0) {
    throw new Error("Cluster ID is required");
  }
  return id;
}

function assertStopped(status: ServerStatus, serverName: string): void {
  if (status !== "stopped") {
    throw new Error(
      `Server “${serverName}” must be stopped before template apply (status: ${status})`,
    );
  }
}

function assertMemberOfCluster(server: ServerProfile, clusterId: string): void {
  if (server.clusterId === null || server.clusterId !== clusterId) {
    throw new Error(
      `Server “${server.name}” is not a member of cluster “${clusterId}”`,
    );
  }
}

/** Seed requires the server to already belong to this cluster (same as apply). */
function assertSeedTarget(server: ServerProfile, clusterId: string): void {
  if (server.clusterId === null) {
    throw new Error(
      `Server “${server.name}” must join the cluster before seeding INI`,
    );
  }
  if (server.clusterId !== clusterId) {
    throw new Error(
      `Server “${server.name}” belongs to a different cluster`,
    );
  }
}

/**
 * Seed / promote / restore for cluster INI templates (#89).
 * One member per operation — bulk apply is #90.
 */
export class ClusterIniTemplateApplyService {
  constructor(
    private readonly templates: ClusterIniTemplateRepository,
    private readonly servers: ServerRepository,
    private readonly ini: IniService,
    private readonly locks: InstanceLockManager,
    private readonly backups: BackupService,
    private readonly runtime: ServerRuntimeStatusReader,
  ) {}

  previewRestore(
    clusterId: string,
    serverId: string,
  ): Promise<ClusterIniTemplateMemberPreview> {
    return this.buildMemberPreview(clusterId, serverId, "restore");
  }

  previewPromote(
    clusterId: string,
    serverId: string,
  ): Promise<ClusterIniTemplateMemberPreview> {
    return this.buildMemberPreview(clusterId, serverId, "promote");
  }

  previewSeed(
    clusterId: string,
    serverId: string,
  ): Promise<ClusterIniTemplateMemberPreview> {
    return this.buildMemberPreview(clusterId, serverId, "seed");
  }

  async restore(
    clusterId: string,
    serverId: string,
  ): Promise<ClusterIniTemplateApplyResult> {
    return this.applyToMember(clusterId, serverId, "restore");
  }

  async seed(
    clusterId: string,
    serverId: string,
  ): Promise<ClusterIniTemplateApplyResult> {
    return this.applyToMember(clusterId, serverId, "seed");
  }

  async promote(
    clusterId: string,
    serverId: string,
  ): Promise<ClusterIniTemplateApplyResult> {
    const id = normalizeClusterId(clusterId);
    const server = this.requireServer(serverId);
    assertMemberOfCluster(server, id);
    assertStopped(this.runtime.getStatus(serverId).status, server.name);

    const snapshot = await this.ini.readServerIni(serverId);
    const next = composeTemplatePayloadFromMember(snapshot.payload);
    const current = this.templates.get(id)?.payload ?? {
      gameUserSettings: "",
      game: "",
    };
    const preview = finalizeClusterIniApplyPreview(buildIniPreview(current, next));
    if (!preview.valid) {
      throw new Error(
        `Invalid INI: ${preview.issues.map((i) => `${i.fileKey}: ${i.message}`).join(" | ")}`,
      );
    }

    // Validate fully before mutating the persisted template.
    const template = this.templates.upsert(id, next);
    this.servers.addEvent(
      serverId,
      "server_updated",
      "info",
      `Promoted INI into cluster template “${id}” (${preview.changedCount} changes)`,
    );

    return {
      operation: "promote",
      clusterId: id,
      serverId,
      preview,
      template,
      backupId: null,
      snapshotDir: null,
    };
  }

  private async buildMemberPreview(
    clusterId: string,
    serverId: string,
    operation: "restore" | "promote" | "seed",
  ): Promise<ClusterIniTemplateMemberPreview> {
    const id = normalizeClusterId(clusterId);
    const server = this.requireServer(serverId);
    if (operation === "seed") {
      assertSeedTarget(server, id);
    } else {
      assertMemberOfCluster(server, id);
    }

    const snapshot = await this.ini.readServerIni(serverId);

    if (operation === "promote") {
      const next = composeTemplatePayloadFromMember(snapshot.payload);
      const current = this.templates.get(id)?.payload ?? {
        gameUserSettings: "",
        game: "",
      };
      return {
        operation,
        clusterId: id,
        serverId,
        serverName: server.name,
        preview: finalizeClusterIniApplyPreview(buildIniPreview(current, next)),
      };
    }

    const template = this.requireTemplate(id);
    const next = composeMemberPayloadFromTemplate(
      template.payload,
      server,
      snapshot.payload,
    );
    return {
      operation,
      clusterId: id,
      serverId,
      serverName: server.name,
      preview: finalizeClusterIniApplyPreview(
        buildIniPreview(snapshot.payload, next),
      ),
    };
  }

  private async applyToMember(
    clusterId: string,
    serverId: string,
    operation: "restore" | "seed",
  ): Promise<ClusterIniTemplateApplyResult> {
    const id = normalizeClusterId(clusterId);
    const server = this.requireServer(serverId);
    if (operation === "restore") {
      assertMemberOfCluster(server, id);
    } else {
      assertSeedTarget(server, id);
    }

    return this.locks.withLock(serverId, `cluster-ini-${operation}`, async () => {
      assertStopped(this.runtime.getStatus(serverId).status, server.name);

      const template = this.requireTemplate(id);
      const current = await this.ini.readServerIni(serverId);
      const next = composeMemberPayloadFromTemplate(
        template.payload,
        server,
        current.payload,
      );
      const preview = finalizeClusterIniApplyPreview(
        buildIniPreview(current.payload, next),
      );
      if (!preview.valid) {
        throw new Error(
          `Invalid INI: ${preview.issues.map((i) => `${i.fileKey}: ${i.message}`).join(" | ")}`,
        );
      }

      // Recoverable backup before any overwrite.
      const { backupId, snapshotDir } = await this.createPreWriteBackup(
        serverId,
        current,
      );

      try {
        await this.writeIniPayload(current, next);
      } catch (error) {
        throw new Error(
          `Failed to write INI after backup${
            backupId !== null ? ` (backup ${backupId})` : ""
          }${snapshotDir !== null ? ` (snapshot ${snapshotDir})` : ""}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      this.servers.addEvent(
        serverId,
        "server_updated",
        "info",
        `${operation === "seed" ? "Seeded" : "Restored"} INI from cluster template “${id}” (${preview.changedCount} changes)`,
      );

      return {
        operation,
        clusterId: id,
        serverId,
        preview,
        template,
        backupId,
        snapshotDir,
      };
    });
  }

  private async createPreWriteBackup(
    serverId: string,
    current: Awaited<ReturnType<IniService["readServerIni"]>>,
  ): Promise<{ backupId: string | null; snapshotDir: string | null }> {
    // Prefer cataloged INI backup when the install is Ready; always keep a
    // local file snapshot so incomplete installs remain recoverable.
    const snapshotDir = await this.writeLocalIniSnapshot(current);

    let backupId: string | null = null;
    try {
      const records: BackupRecord[] = await this.backups.createManualBackup(
        serverId,
        ["ini"],
      );
      backupId = records.find((row) => row.kind === "ini")?.id ?? null;
    } catch {
      // Local snapshot already written — Ready install is not required for #89.
    }

    return { backupId, snapshotDir };
  }

  private async writeLocalIniSnapshot(
    current: Awaited<ReturnType<IniService["readServerIni"]>>,
  ): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotDir = join(
      dirname(current.gameUserSettingsPath),
      ".yark-pre-template",
      stamp,
    );
    await mkdir(snapshotDir, { recursive: true });

    const gusDest = join(snapshotDir, "GameUserSettings.ini");
    const gameDest = join(snapshotDir, "Game.ini");

    if (existsSync(current.gameUserSettingsPath)) {
      await copyFile(current.gameUserSettingsPath, gusDest);
    } else {
      await writeFile(gusDest, current.payload.gameUserSettings, "utf8");
    }
    if (existsSync(current.gameIniPath)) {
      await copyFile(current.gameIniPath, gameDest);
    } else {
      await writeFile(gameDest, current.payload.game, "utf8");
    }

    return snapshotDir;
  }

  private async writeIniPayload(
    current: Awaited<ReturnType<IniService["readServerIni"]>>,
    payload: ServerIniPayload,
  ): Promise<void> {
    await mkdir(dirname(current.gameUserSettingsPath), { recursive: true });
    await writeFile(current.gameUserSettingsPath, payload.gameUserSettings, "utf8");
    await writeFile(current.gameIniPath, payload.game, "utf8");
  }

  private requireServer(serverId: string): ServerProfile {
    const server = this.servers.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }
    return server;
  }

  private requireTemplate(clusterId: string): ClusterIniTemplate {
    const template = this.templates.get(clusterId);
    if (template === null) {
      throw new Error(`No INI template saved for cluster “${clusterId}”`);
    }
    return template;
  }
}
