import type { ServerProfile, ServerProfileInput } from "@shared/types";
import {
  buildStructuredLaunchArgList,
  emptyStructuredLaunchArgs,
  findLaunchArgConflicts,
  listStructuredLaunchUiOptions,
  normalizeStructuredLaunchArgs,
  redactLaunchArgForPreview,
  structuredLaunchGroupLabel,
  STRUCTURED_LAUNCH_GROUP_ORDER,
  type StructuredLaunchArgs,
  type StructuredLaunchGroupId,
  type StructuredLaunchUiOption,
} from "@shared/structured-launch-options";

export function previewBinaryPath(installDir: string): string {
  return `${installDir.replace(/[\\/]+$/, "")}\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe`;
}

export function parseRawExtraArgs(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function joinRawExtraArgs(args: string[]): string {
  return args.join(" ");
}

export function toLaunchProfileInput(
  server: ServerProfile,
  structuredLaunchArgs: StructuredLaunchArgs,
  extraArgs: string[],
): ServerProfileInput {
  return {
    name: server.name,
    map: server.map,
    installDir: server.installDir,
    sessionName: server.sessionName,
    gamePort: server.gamePort,
    queryPort: server.queryPort,
    rconPort: server.rconPort,
    serverPassword: server.serverPassword,
    adminPassword: server.adminPassword,
    clusterId: server.clusterId,
    clusterDir: server.clusterDir,
    extraArgs,
    structuredLaunchArgs: normalizeStructuredLaunchArgs(structuredLaunchArgs),
    mods: server.mods,
    disabledMods: server.disabledMods ?? [],
    modMetadataCache: server.modMetadataCache ?? {},
    autoStart: server.autoStart,
  };
}

export function yarkOwnedPreviewTokens(server: ServerProfile): string[] {
  const parts = [
    `"${server.map}"?SessionName="${server.sessionName}"`,
    `-port=${server.gamePort}`,
  ];
  const structured = buildStructuredLaunchArgList(server.structuredLaunchArgs);
  const trailing = [...structured, ...server.extraArgs];
  if (!trailing.some((a) => /ServerPlatform/i.test(a))) {
    parts.push("-ServerPlatform=ALL");
  }
  const disabled = new Set(server.disabledMods ?? []);
  const mods = server.mods.filter((id) => !disabled.has(id));
  if (mods.length > 0) parts.push(`-mods=${mods.join(",")}`);
  if (server.clusterId && server.clusterDir) {
    parts.push(`-clusterid=${server.clusterId}`);
    parts.push(`-ClusterDirOverride=${server.clusterDir}`);
    parts.push("-NoTransferFromFiltering");
  }
  return parts;
}

export function buildLaunchPreviewParts(input: {
  server: ServerProfile;
  structured: StructuredLaunchArgs;
  extraArgs: string[];
}): {
  yark: string[];
  structured: string[];
  raw: string[];
} {
  const draft: ServerProfile = {
    ...input.server,
    structuredLaunchArgs: input.structured,
    extraArgs: input.extraArgs,
  };
  return {
    yark: yarkOwnedPreviewTokens(draft),
    structured: buildStructuredLaunchArgList(input.structured).map(
      redactLaunchArgForPreview,
    ),
    raw: input.extraArgs.map(redactLaunchArgForPreview),
  };
}

export function groupStructuredOptions(): Map<
  StructuredLaunchGroupId,
  StructuredLaunchUiOption[]
> {
  const map = new Map<StructuredLaunchGroupId, StructuredLaunchUiOption[]>();
  for (const group of STRUCTURED_LAUNCH_GROUP_ORDER) map.set(group, []);

  const all = listStructuredLaunchUiOptions();
  const dependentsByParent = new Map<string, StructuredLaunchUiOption[]>();
  for (const option of all) {
    const parentId = option.curation.dependsOn;
    if (!parentId) continue;
    const list = dependentsByParent.get(parentId) ?? [];
    list.push(option);
    dependentsByParent.set(parentId, list);
  }

  const appendWithDependents = (
    groupId: StructuredLaunchGroupId,
    option: StructuredLaunchUiOption,
  ): void => {
    map.get(groupId)!.push(option);
    for (const dependent of dependentsByParent.get(option.curation.id) ?? []) {
      appendWithDependents(groupId, dependent);
    }
  };

  for (const option of all) {
    if (option.curation.dependsOn) continue;
    appendWithDependents(option.curation.group, option);
  }
  return map;
}

export function countEnabledStructured(structured: StructuredLaunchArgs): number {
  return Object.values(normalizeStructuredLaunchArgs(structured)).filter(
    (s) => s.enabled,
  ).length;
}

export {
  structuredLaunchGroupLabel,
  emptyStructuredLaunchArgs,
  findLaunchArgConflicts,
  normalizeStructuredLaunchArgs,
  STRUCTURED_LAUNCH_GROUP_ORDER,
};
