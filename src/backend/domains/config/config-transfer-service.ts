import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertConfigTransferSelection,
  composeModLists,
  composeStringList,
  configTransferSelectionHasWork,
  type ConfigTransferSelection,
} from "@shared/config-transfer";
import type {
  BackupPolicy,
  ConfigTransferCommitResult,
  ConfigTransferDescribeResult,
  ConfigTransferPreview,
  ConfigTransferProfileDiff,
  IniPreview,
  ServerIniPayload,
  ServerProfile,
  ServerStatus,
} from "@shared/types";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { BackupService } from "../backups/backup-service";
import type { InstanceService } from "../instances/instance-service";
import {
  finalizeClusterIniApplyPreview,
  redactIniPreviewSecrets,
} from "./ini-compose";
import { buildIniPreview } from "./ini-preview";
import type { IniService } from "./ini-service";
import {
  composeIniPayloadFromSelection,
  profileToIniIdentity,
} from "./ini-selection-compose";
import { listIniUiCategoryTree } from "@shared/ini-ui-category-tree";
import { buildStructuredLaunchArgList } from "@shared/structured-launch-options";

export interface ServerRuntimeStatusReader {
  getStatus(serverId: string): { status: ServerStatus };
}

function assertStopped(status: ServerStatus, serverName: string): void {
  if (status !== "stopped") {
    throw new Error(
      `Server “${serverName}” must be stopped before configuration copy (status: ${status})`,
    );
  }
}

function policyFingerprint(policy: BackupPolicy): string {
  return JSON.stringify({
    enabled: policy.enabled,
    intervalMinutes: policy.intervalMinutes,
    retainCountWorld: policy.retainCountWorld,
    retainCountPlayers: policy.retainCountPlayers,
    retainCountIni: policy.retainCountIni,
    backupDir: policy.backupDir,
  });
}

function profileTransferFingerprint(profile: ServerProfile): string {
  // Do not include password plaintext — profile.updatedAt already changes on
  // password edits, and CodeQL treats password→sha256 as insecure storage.
  return JSON.stringify({
    updatedAt: profile.updatedAt,
    mods: profile.mods,
    disabledMods: profile.disabledMods ?? [],
    extraArgs: profile.extraArgs,
    structuredLaunchArgs: profile.structuredLaunchArgs ?? {},
    modMetadataCache: profile.modMetadataCache ?? {},
  });
}

function hashParts(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 24);
}

/**
 * One-shot selective configuration copy between profiles (#95).
 * Not sync — no persistent source/target relationship.
 */
export class ConfigTransferService {
  constructor(
    private readonly servers: ServerRepository,
    private readonly instances: InstanceService,
    private readonly ini: IniService,
    private readonly locks: InstanceLockManager,
    private readonly backups: BackupService,
    private readonly runtime: ServerRuntimeStatusReader,
  ) {}

  async describeSource(sourceId: string): Promise<ConfigTransferDescribeResult> {
    const source = this.requireServer(sourceId);
    const snapshot = await this.ini.readServerIni(sourceId);
    return {
      sourceId,
      sourceName: source.name,
      sourceStatus: this.runtime.getStatus(sourceId).status,
      gameUserSettings: listIniUiCategoryTree(
        snapshot.payload.gameUserSettings,
        "gameUserSettings",
        { excludeOwnedGusKeys: true },
      ),
      game: listIniUiCategoryTree(snapshot.payload.game, "game"),
      mods: source.mods,
      disabledMods: source.disabledMods ?? [],
      extraArgs: source.extraArgs,
      structuredLaunchArgs: buildStructuredLaunchArgList(
        source.structuredLaunchArgs,
      ),
      hasPasswords: Boolean(
        (source.adminPassword?.trim().length ?? 0) > 0 ||
          (source.serverPassword?.trim().length ?? 0) > 0,
      ),
    };
  }

  async preview(
    sourceId: string,
    targetId: string,
    rawSelection: unknown,
  ): Promise<ConfigTransferPreview> {
    const selection = assertConfigTransferSelection(rawSelection);
    if (!configTransferSelectionHasWork(selection)) {
      throw new Error("Select at least one configuration category to copy");
    }
    if (sourceId === targetId) {
      throw new Error("Source and target must be different servers");
    }

    const source = this.requireServer(sourceId);
    const target = this.requireServer(targetId);
    assertStopped(this.runtime.getStatus(targetId).status, target.name);

    const sourceIni = await this.ini.readServerIni(sourceId);
    const targetIni = await this.ini.readServerIni(targetId);
    const targetPolicy = this.backups.getPolicy(targetId);
    const sourcePolicy = this.backups.getPolicy(sourceId);

    const composed = this.composePayload(
      source,
      target,
      sourceIni.payload,
      targetIni.payload,
      selection,
    );

    const iniPreview = finalizeClusterIniApplyPreview(
      buildIniPreview(targetIni.payload, composed.ini),
    );

    const profileDiff = this.buildProfileDiff(source, target, selection, sourcePolicy, targetPolicy);
    const fingerprint = this.buildFingerprint(
      source,
      target,
      sourceIni.payload,
      targetIni.payload,
      sourcePolicy,
      targetPolicy,
      selection,
    );

    return {
      sourceId,
      targetId,
      sourceName: source.name,
      targetName: target.name,
      sourceStatus: this.runtime.getStatus(sourceId).status,
      targetStatus: this.runtime.getStatus(targetId).status,
      fingerprint,
      selection,
      iniPreview,
      profileDiff,
      warnings: this.buildWarnings(source, selection),
    };
  }

  async commit(
    sourceId: string,
    targetId: string,
    rawSelection: unknown,
    fingerprint: string,
  ): Promise<ConfigTransferCommitResult> {
    const selection = assertConfigTransferSelection(rawSelection);
    if (!configTransferSelectionHasWork(selection)) {
      throw new Error("Select at least one configuration category to copy");
    }
    if (sourceId === targetId) {
      throw new Error("Source and target must be different servers");
    }
    if (typeof fingerprint !== "string" || fingerprint.trim().length === 0) {
      throw new Error("Preview fingerprint is required");
    }

    const source = this.requireServer(sourceId);

    return this.locks.withLock(targetId, "config-transfer", async () => {
      const target = this.requireServer(targetId);
      assertStopped(this.runtime.getStatus(targetId).status, target.name);

      const sourceIni = await this.ini.readServerIni(sourceId);
      const targetIni = await this.ini.readServerIni(targetId);
      const targetPolicy = this.backups.getPolicy(targetId);
      const sourcePolicy = this.backups.getPolicy(sourceId);

      const freshFingerprint = this.buildFingerprint(
        source,
        target,
        sourceIni.payload,
        targetIni.payload,
        sourcePolicy,
        targetPolicy,
        selection,
      );
      if (freshFingerprint !== fingerprint.trim()) {
        throw new Error(
          "Configuration changed since preview — regenerate the preview and try again",
        );
      }

      const composed = this.composePayload(
        source,
        target,
        sourceIni.payload,
        targetIni.payload,
        selection,
      );
      const iniPreview = finalizeClusterIniApplyPreview(
        buildIniPreview(targetIni.payload, composed.ini),
      );
      if (!iniPreview.valid) {
        throw new Error(
          `Invalid INI: ${iniPreview.issues.map((i) => `${i.fileKey}: ${i.message}`).join(" | ")}`,
        );
      }

      const profileSnapshot = { ...target };
      const policySnapshot = { ...targetPolicy };
      const { backupId, snapshotDir } = await this.createPreCopySnapshot(
        targetId,
        targetIni,
      );

      try {
        // INI first: instances.update syncs owned keys to GUS asynchronously and
        // must not race-clobber rates written by this transfer.
        if (
          selection.gameUserSettings.enabled ||
          selection.game.enabled
        ) {
          await this.writeIniPayload(targetIni, composed.ini, selection);
        }

        // Profile fields (mods / extraArgs / passwords)
        if (
          selection.mods.enabled ||
          selection.extraArgs.enabled ||
          selection.passwords
        ) {
          const composedMods = selection.mods.enabled
            ? composeModLists(
                {
                  mods: source.mods,
                  disabledMods: source.disabledMods ?? [],
                  modMetadataCache: source.modMetadataCache ?? {},
                },
                {
                  mods: target.mods,
                  disabledMods: target.disabledMods ?? [],
                  modMetadataCache: target.modMetadataCache ?? {},
                },
                selection.mods.strategy,
              )
            : null;
          this.instances.update(targetId, {
            name: target.name,
            map: target.map,
            installDir: target.installDir,
            autoStart: target.autoStart,
            sessionName: target.sessionName,
            gamePort: target.gamePort,
            queryPort: target.queryPort,
            rconPort: target.rconPort,
            serverPassword: selection.passwords
              ? source.serverPassword
              : target.serverPassword,
            adminPassword: selection.passwords
              ? source.adminPassword
              : target.adminPassword,
            clusterId: target.clusterId,
            clusterDir: target.clusterDir,
            extraArgs: selection.extraArgs.enabled
              ? composeStringList(
                  source.extraArgs,
                  target.extraArgs,
                  selection.extraArgs.strategy,
                )
              : [...target.extraArgs],
            structuredLaunchArgs: selection.extraArgs.enabled
              ? selection.extraArgs.strategy === "replace"
                ? { ...(source.structuredLaunchArgs ?? {}) }
                : {
                    ...(target.structuredLaunchArgs ?? {}),
                    ...(source.structuredLaunchArgs ?? {}),
                  }
              : { ...(target.structuredLaunchArgs ?? {}) },
            mods: composedMods !== null ? composedMods.mods : [...target.mods],
            disabledMods:
              composedMods !== null
                ? composedMods.disabledMods
                : [...(target.disabledMods ?? [])],
            modMetadataCache:
              composedMods !== null
                ? composedMods.modMetadataCache
                : { ...(target.modMetadataCache ?? {}) },
          });
        }

        if (selection.backupPolicy) {
          this.backups.setPolicy(targetId, {
            enabled: sourcePolicy.enabled,
            intervalMinutes: sourcePolicy.intervalMinutes,
            retainCountWorld: sourcePolicy.retainCountWorld,
            retainCountPlayers: sourcePolicy.retainCountPlayers,
            retainCountIni: sourcePolicy.retainCountIni,
            // Keep the target's backup root — never inherit the source path.
            backupDir: targetPolicy.backupDir,
          });
        }
      } catch (error) {
        await this.rollbackTarget(
          targetId,
          profileSnapshot,
          policySnapshot,
          targetIni,
          snapshotDir,
          selection,
        );
        throw new Error(
          `Configuration copy failed; previous target settings restored${
            backupId !== null ? ` (backup ${backupId})` : ""
          }${snapshotDir !== null ? ` (snapshot ${snapshotDir})` : ""}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      this.servers.addEvent(
        targetId,
        "server_updated",
        "info",
        `Copied configuration from “${source.name}” (${iniPreview.changedCount} INI changes)`,
      );

      return {
        sourceId,
        targetId,
        sourceName: source.name,
        targetName: target.name,
        fingerprint: freshFingerprint,
        iniPreview,
        profileDiff: this.buildProfileDiff(
          source,
          target,
          selection,
          sourcePolicy,
          targetPolicy,
        ),
        backupId,
        snapshotDir,
      };
    });
  }

  private composePayload(
    source: ServerProfile,
    target: ServerProfile,
    sourceIni: ServerIniPayload,
    targetIni: ServerIniPayload,
    selection: ConfigTransferSelection,
  ): { ini: ServerIniPayload } {
    const passwordsFromSource = selection.passwords
      ? {
          ...profileToIniIdentity(target),
          adminPassword: source.adminPassword,
          serverPassword: source.serverPassword,
        }
      : undefined;

    return {
      ini: composeIniPayloadFromSelection(
        sourceIni,
        targetIni,
        selection,
        profileToIniIdentity(target),
        { passwordsFromSource },
      ),
    };
  }

  private buildFingerprint(
    source: ServerProfile,
    target: ServerProfile,
    sourceIni: ServerIniPayload,
    targetIni: ServerIniPayload,
    sourcePolicy: BackupPolicy,
    targetPolicy: BackupPolicy,
    selection: ConfigTransferSelection,
  ): string {
    return hashParts([
      source.id,
      target.id,
      profileTransferFingerprint(source),
      profileTransferFingerprint(target),
      sourceIni.gameUserSettings,
      sourceIni.game,
      targetIni.gameUserSettings,
      targetIni.game,
      policyFingerprint(sourcePolicy),
      policyFingerprint(targetPolicy),
      JSON.stringify(selection),
    ]);
  }

  private buildProfileDiff(
    source: ServerProfile,
    target: ServerProfile,
    selection: ConfigTransferSelection,
    sourcePolicy: BackupPolicy,
    targetPolicy: BackupPolicy,
  ): ConfigTransferProfileDiff {
    const composedMods = selection.mods.enabled
      ? composeModLists(
          {
            mods: source.mods,
            disabledMods: source.disabledMods ?? [],
            modMetadataCache: source.modMetadataCache ?? {},
          },
          {
            mods: target.mods,
            disabledMods: target.disabledMods ?? [],
            modMetadataCache: target.modMetadataCache ?? {},
          },
          selection.mods.strategy,
        )
      : null;
    return {
      mods:
        composedMods !== null
          ? {
              before: [...target.mods],
              after: composedMods.mods,
              disabledBefore: [...(target.disabledMods ?? [])],
              disabledAfter: composedMods.disabledMods,
            }
          : null,
      extraArgs: selection.extraArgs.enabled
        ? {
            before: [...target.extraArgs],
            after: composeStringList(
              source.extraArgs,
              target.extraArgs,
              selection.extraArgs.strategy,
            ),
          }
        : null,
      structuredLaunchArgs: selection.extraArgs.enabled
        ? {
            before: buildStructuredLaunchArgList(target.structuredLaunchArgs),
            after: buildStructuredLaunchArgList(
              selection.extraArgs.strategy === "replace"
                ? { ...(source.structuredLaunchArgs ?? {}) }
                : {
                    ...(target.structuredLaunchArgs ?? {}),
                    ...(source.structuredLaunchArgs ?? {}),
                  },
            ),
          }
        : null,
      backupPolicy: selection.backupPolicy
        ? {
            before: {
              enabled: targetPolicy.enabled,
              intervalMinutes: targetPolicy.intervalMinutes,
              retainCountWorld: targetPolicy.retainCountWorld,
              retainCountPlayers: targetPolicy.retainCountPlayers,
              retainCountIni: targetPolicy.retainCountIni,
              backupDir: targetPolicy.backupDir,
            },
            after: {
              enabled: sourcePolicy.enabled,
              intervalMinutes: sourcePolicy.intervalMinutes,
              retainCountWorld: sourcePolicy.retainCountWorld,
              retainCountPlayers: sourcePolicy.retainCountPlayers,
              retainCountIni: sourcePolicy.retainCountIni,
              backupDir: targetPolicy.backupDir,
            },
          }
        : null,
      passwords: selection.passwords
        ? { changed: true, redacted: true }
        : null,
    };
  }

  private buildWarnings(
    source: ServerProfile,
    selection: ConfigTransferSelection,
  ): string[] {
    const warnings: string[] = [];
    if (this.runtime.getStatus(source.id).status !== "stopped") {
      warnings.push(
        "Source is running — we copy saved settings, not live game memory.",
      );
    }
    if (selection.passwords) {
      warnings.push("Passwords will be copied (hidden in this preview).");
    }
    return warnings;
  }

  private async createPreCopySnapshot(
    serverId: string,
    current: Awaited<ReturnType<IniService["readServerIni"]>>,
  ): Promise<{ backupId: string | null; snapshotDir: string }> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotDir = join(
      dirname(current.gameUserSettingsPath),
      ".yark-pre-copy",
      stamp,
    );
    await mkdir(snapshotDir, { recursive: true });
    await this.copyOrWrite(
      current.gameUserSettingsPath,
      join(snapshotDir, "GameUserSettings.ini"),
      current.payload.gameUserSettings,
    );
    await this.copyOrWrite(
      current.gameIniPath,
      join(snapshotDir, "Game.ini"),
      current.payload.game,
    );

    // Persist a JSON snapshot of profile+policy for rollback.
    const target = this.requireServer(serverId);
    const policy = this.backups.getPolicy(serverId);
    await writeFile(
      join(snapshotDir, "profile-policy.json"),
      JSON.stringify({ profile: target, policy }, null, 2),
      "utf8",
    );

    let backupId: string | null = null;
    try {
      const records = await this.backups.createManualBackup(serverId, ["ini"]);
      backupId = records.find((row) => row.kind === "ini")?.id ?? null;
    } catch {
      // Local snapshot is enough when catalog backup is unavailable.
    }

    return { backupId, snapshotDir };
  }

  private async copyOrWrite(
    sourcePath: string,
    destPath: string,
    fallbackText: string,
  ): Promise<void> {
    try {
      await copyFile(sourcePath, destPath);
    } catch {
      await writeFile(destPath, fallbackText, "utf8");
    }
  }

  private async writeIniPayload(
    current: Awaited<ReturnType<IniService["readServerIni"]>>,
    payload: ServerIniPayload,
    selection: ConfigTransferSelection,
  ): Promise<void> {
    await mkdir(dirname(current.gameUserSettingsPath), { recursive: true });
    if (selection.gameUserSettings.enabled) {
      await writeFile(
        current.gameUserSettingsPath,
        payload.gameUserSettings,
        "utf8",
      );
    }
    if (selection.game.enabled) {
      await writeFile(current.gameIniPath, payload.game, "utf8");
    }
  }

  private async rollbackTarget(
    targetId: string,
    profileSnapshot: ServerProfile,
    policySnapshot: BackupPolicy,
    targetIni: Awaited<ReturnType<IniService["readServerIni"]>>,
    snapshotDir: string,
    selection: ConfigTransferSelection,
  ): Promise<void> {
    try {
      if (selection.mods.enabled || selection.extraArgs.enabled || selection.passwords) {
        this.instances.update(targetId, {
          name: profileSnapshot.name,
          map: profileSnapshot.map,
          installDir: profileSnapshot.installDir,
          autoStart: profileSnapshot.autoStart,
          sessionName: profileSnapshot.sessionName,
          gamePort: profileSnapshot.gamePort,
          queryPort: profileSnapshot.queryPort,
          rconPort: profileSnapshot.rconPort,
          serverPassword: profileSnapshot.serverPassword,
          adminPassword: profileSnapshot.adminPassword,
          clusterId: profileSnapshot.clusterId,
          clusterDir: profileSnapshot.clusterDir,
          extraArgs: [...profileSnapshot.extraArgs],
          structuredLaunchArgs: {
            ...(profileSnapshot.structuredLaunchArgs ?? {}),
          },
          mods: [...profileSnapshot.mods],
          disabledMods: [...(profileSnapshot.disabledMods ?? [])],
          modMetadataCache: { ...(profileSnapshot.modMetadataCache ?? {}) },
        });
      }
      if (selection.backupPolicy) {
        this.backups.setPolicy(targetId, {
          enabled: policySnapshot.enabled,
          intervalMinutes: policySnapshot.intervalMinutes,
          retainCountWorld: policySnapshot.retainCountWorld,
          retainCountPlayers: policySnapshot.retainCountPlayers,
          retainCountIni: policySnapshot.retainCountIni,
          backupDir: policySnapshot.backupDir,
        });
      }
      if (selection.gameUserSettings.enabled || selection.game.enabled) {
        const gus = await readFile(
          join(snapshotDir, "GameUserSettings.ini"),
          "utf8",
        ).catch(() => targetIni.payload.gameUserSettings);
        const game = await readFile(join(snapshotDir, "Game.ini"), "utf8").catch(
          () => targetIni.payload.game,
        );
        await this.writeIniPayload(
          targetIni,
          {
            gameUserSettings: gus,
            game,
          },
          selection,
        );
      }
    } catch (rollbackError) {
      throw new Error(
        `Configuration copy failed and rollback also failed (snapshot ${snapshotDir}): ${
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError)
        }`,
      );
    }
  }

  private requireServer(serverId: string): ServerProfile {
    const server = this.servers.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }
    return server;
  }
}

/** Re-export redaction helper for tests / callers that only have IniPreview. */
export function redactTransferIniPreview(preview: IniPreview): IniPreview {
  return redactIniPreviewSecrets(preview);
}
