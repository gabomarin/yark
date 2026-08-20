import type { ServerProfile } from "@shared/types";
import { buildMapUrlArg } from "@shared/launch-map-url";
import {
  argsIncludeServerPlatform,
  buildStructuredLaunchArgList,
  findLaunchArgConflicts,
  isWinLiveMaxPlayersArg,
  listStructuredLaunchUiOptions,
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

/**
 * Split Extra arguments on whitespace while keeping double-quoted spans intact
 * (including spaces and `\"` inside quotes). Quotes stay on the token.
 */
export function parseRawExtraArgs(raw: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  const text = raw.trim();

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '"') {
      // Count preceding backslashes: odd → escaped quote, stay in/out of quotes.
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && text[j] === "\\"; j -= 1) {
        backslashes += 1;
      }
      if (backslashes % 2 === 0) {
        inQuotes = !inQuotes;
      }
      current += ch;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (current.length > 0) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) out.push(current);
  return out;
}

export function joinRawExtraArgs(args: string[]): string {
  return args.join(" ");
}

export function yarkOwnedPreviewTokens(server: ServerProfile): string[] {
  const parts = [
    buildMapUrlArg(server.map, server.sessionName),
    `-port=${server.gamePort}`,
  ];
  if (server.maxPlayers > 0) {
    parts.push(`-WinLiveMaxPlayers=${server.maxPlayers}`);
  }
  const structured = buildStructuredLaunchArgList(
    server.structuredLaunchArgs,
  ).filter((arg) => !isWinLiveMaxPlayersArg(arg));
  const extraArgs = server.extraArgs.filter(
    (arg) => !isWinLiveMaxPlayersArg(arg),
  );
  const trailing = [...structured, ...extraArgs];
  if (!argsIncludeServerPlatform(trailing)) {
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

const structuredLaunchSearchHaystackCache = new Map<string, string>();

/** Precomputed operator-visible text for Launch tab search (#352). */
function structuredLaunchSearchHaystack(
  option: StructuredLaunchUiOption,
  groupId: StructuredLaunchGroupId,
): string {
  const key = `${groupId}:${option.curation.id}`;
  const cached = structuredLaunchSearchHaystackCache.get(key);
  if (cached !== undefined) return cached;

  const haystack = [
    option.entry.token,
    option.entry.summary,
    option.entry.details,
    option.entry.description,
    option.curation.operatorWarning ?? "",
    structuredLaunchGroupLabel(groupId),
    option.curation.id,
    ...option.entry.aliases,
  ]
    .join(" ")
    .toLowerCase();

  structuredLaunchSearchHaystackCache.set(key, haystack);
  return haystack;
}

/** Operator-visible text for Launch tab search (#352). */
function matchesStructuredLaunchSearch(
  option: StructuredLaunchUiOption,
  groupId: StructuredLaunchGroupId,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return structuredLaunchSearchHaystack(option, groupId).includes(q);
}

export function filterGroupedStructuredOptions(
  grouped: Map<StructuredLaunchGroupId, StructuredLaunchUiOption[]>,
  query: string,
): Map<StructuredLaunchGroupId, StructuredLaunchUiOption[]> {
  const q = query.trim();
  if (q.length === 0) return grouped;

  const out = new Map<StructuredLaunchGroupId, StructuredLaunchUiOption[]>();
  for (const groupId of STRUCTURED_LAUNCH_GROUP_ORDER) {
    const options = grouped.get(groupId) ?? [];
    const filtered = options.filter((option) =>
      matchesStructuredLaunchSearch(option, groupId, q),
    );
    if (filtered.length > 0) out.set(groupId, filtered);
  }
  return out;
}

export {
  structuredLaunchGroupLabel,
  findLaunchArgConflicts,
  STRUCTURED_LAUNCH_GROUP_ORDER,
};
