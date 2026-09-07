import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AsaApiPluginInfo, AsaApiStatus } from "@shared/types";
import {
  ASA_API_PLUGIN_DISABLED_SUFFIX,
  asaApiCoreDllPath,
  asaApiDisabledPluginsDir,
  asaApiLegacyWin64DisabledPluginsDir,
  asaApiLoaderPath,
  asaApiPluginsDir,
  asaApiVersionDllDisabledPath,
  asaApiVersionDllPath,
  asaWin64Dir,
} from "./asa-api-paths";

function isSafePluginName(name: string): boolean {
  return (
    name.trim().length > 0
    && !/[\\/]/.test(name)
    && !name.includes("..")
  );
}

function legacyDisabledPluginName(folderName: string): string | null {
  if (!folderName.toLowerCase().endsWith(ASA_API_PLUGIN_DISABLED_SUFFIX)) {
    return null;
  }
  const name = folderName.slice(0, -ASA_API_PLUGIN_DISABLED_SUFFIX.length);
  return isSafePluginName(name) ? name : null;
}

async function resolveConfigFile(
  pluginDir: string,
  pluginName: string,
): Promise<string | null> {
  const candidates = [
    "config.json",
    "Config.json",
    `${pluginName}.json`,
    "PluginInfo.json",
  ];
  for (const file of candidates) {
    const full = join(pluginDir, file);
    if (existsSync(full)) return file;
  }
  return null;
}

async function listPluginDirs(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * Move legacy parked plugins into `ArkApi\Disabled_Plugins\<Name>`:
 * - `Plugins\Name.disabled` (early YARK rename)
 * - `Win64\Disabled_Plugins\Name` (brief layout before sibling-of-Plugins)
 */
async function migrateLegacyDisabledPluginFolders(
  installDir: string,
): Promise<void> {
  const pluginsRoot = asaApiPluginsDir(installDir);
  const disabledRoot = asaApiDisabledPluginsDir(installDir);

  for (const folderName of await listPluginDirs(pluginsRoot)) {
    const name = legacyDisabledPluginName(folderName);
    if (name === null) continue;
    const from = join(pluginsRoot, folderName);
    const to = join(disabledRoot, name);
    if (existsSync(to)) {
      await rm(from, { recursive: true, force: true });
      continue;
    }
    await mkdir(disabledRoot, { recursive: true });
    await rename(from, to);
  }

  const legacyWin64Root = asaApiLegacyWin64DisabledPluginsDir(installDir);
  if (legacyWin64Root.toLowerCase() === disabledRoot.toLowerCase()) return;
  for (const folderName of await listPluginDirs(legacyWin64Root)) {
    if (!isSafePluginName(folderName)) continue;
    const from = join(legacyWin64Root, folderName);
    const to = join(disabledRoot, folderName);
    if (existsSync(to)) {
      await rm(from, { recursive: true, force: true });
      continue;
    }
    await mkdir(disabledRoot, { recursive: true });
    await rename(from, to);
  }
  if (existsSync(legacyWin64Root)) {
    const leftover = await listPluginDirs(legacyWin64Root);
    if (leftover.length === 0) {
      await rm(legacyWin64Root, { recursive: true, force: true });
    }
  }
}

async function collectPlugins(
  installDir: string,
): Promise<AsaApiPluginInfo[]> {
  await migrateLegacyDisabledPluginFolders(installDir);

  const pluginsRoot = asaApiPluginsDir(installDir);
  const disabledRoot = asaApiDisabledPluginsDir(installDir);
  const plugins: AsaApiPluginInfo[] = [];
  const seen = new Set<string>();

  for (const folderName of await listPluginDirs(pluginsRoot)) {
    if (legacyDisabledPluginName(folderName) !== null) {
      // Should have been migrated; skip residual oddities.
      continue;
    }
    if (!isSafePluginName(folderName)) continue;
    const key = folderName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const pluginDir = join(pluginsRoot, folderName);
    plugins.push({
      name: folderName,
      folderName,
      enabled: true,
      dllPresent: existsSync(join(pluginDir, `${folderName}.dll`)),
      configFile: await resolveConfigFile(pluginDir, folderName),
    });
  }

  for (const folderName of await listPluginDirs(disabledRoot)) {
    if (!isSafePluginName(folderName)) continue;
    const key = folderName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const pluginDir = join(disabledRoot, folderName);
    plugins.push({
      name: folderName,
      folderName,
      enabled: false,
      dllPresent: existsSync(join(pluginDir, `${folderName}.dll`)),
      configFile: await resolveConfigFile(pluginDir, folderName),
    });
  }

  plugins.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  return plugins;
}

/** Read-only AsaApi presence + plugins for one install. */
export async function readAsaApiStatus(
  installDir: string,
): Promise<AsaApiStatus> {
  const win64 = asaWin64Dir(installDir);
  const loaderPath = asaApiLoaderPath(installDir);
  const versionDllPath = asaApiVersionDllPath(installDir);
  const versionDllDisabledPath = asaApiVersionDllDisabledPath(installDir);
  const apiCorePath = asaApiCoreDllPath(installDir);
  const loaderPresent = existsSync(loaderPath);
  const versionDllPresent = existsSync(versionDllPath);
  const versionDllDisabledPresent = existsSync(versionDllDisabledPath);
  const apiCorePresent = existsSync(apiCorePath);
  const pluginsRoot = asaApiPluginsDir(installDir);
  const plugins = await collectPlugins(installDir);

  let loaderSizeBytes: number | null = null;
  if (loaderPresent) {
    try {
      loaderSizeBytes = (await stat(loaderPath)).size;
    } catch {
      loaderSizeBytes = null;
    }
  }

  const installedOnDisk =
    loaderPresent || versionDllPresent || versionDllDisabledPresent || apiCorePresent;

  return {
    installedOnDisk,
    loaderPresent,
    loaderPath: loaderPresent ? loaderPath : null,
    versionDllPresent,
    versionDllDisabledPresent,
    versionDllPath: versionDllPresent
      ? versionDllPath
      : versionDllDisabledPresent
        ? versionDllDisabledPath
        : null,
    apiCorePresent,
    win64Path: win64,
    pluginsPath: pluginsRoot,
    plugins,
    loaderSizeBytes,
    installedVersionLabel: null,
  };
}

/**
 * Enable/disable by moving the plugin folder between
 * `ArkApi\Plugins\<Name>` and `ArkApi\Disabled_Plugins\<Name>` (sibling of
 * Plugins — AsaApi only auto-loads from Plugins).
 */
export async function setAsaApiPluginEnabled(
  installDir: string,
  pluginName: string,
  enabled: boolean,
): Promise<AsaApiStatus> {
  const trimmed = pluginName.trim();
  if (!isSafePluginName(trimmed)) {
    throw new Error("Invalid plugin name");
  }

  await migrateLegacyDisabledPluginFolders(installDir);

  const pluginsRoot = asaApiPluginsDir(installDir);
  const disabledRoot = asaApiDisabledPluginsDir(installDir);
  const enabledDir = join(pluginsRoot, trimmed);
  const disabledDir = join(disabledRoot, trimmed);
  const legacyDisabledDir = join(
    pluginsRoot,
    `${trimmed}${ASA_API_PLUGIN_DISABLED_SUFFIX}`,
  );

  if (enabled) {
    if (existsSync(enabledDir)) {
      return readAsaApiStatus(installDir);
    }
    const source = existsSync(disabledDir)
      ? disabledDir
      : existsSync(legacyDisabledDir)
        ? legacyDisabledDir
        : null;
    if (source === null) {
      throw new Error(`Plugin "${trimmed}" was not found on disk`);
    }
    await mkdir(pluginsRoot, { recursive: true });
    await rename(source, enabledDir);
  } else {
    if (existsSync(disabledDir)) {
      return readAsaApiStatus(installDir);
    }
    const source = existsSync(enabledDir)
      ? enabledDir
      : existsSync(legacyDisabledDir)
        ? legacyDisabledDir
        : null;
    if (source === null) {
      throw new Error(`Plugin "${trimmed}" was not found on disk`);
    }
    await mkdir(disabledRoot, { recursive: true });
    await rename(source, disabledDir);
  }

  return readAsaApiStatus(installDir);
}

/**
 * Permanently delete a plugin folder from Plugins, Disabled_Plugins, or legacy
 * `Name.disabled` under Plugins.
 */
export async function deleteAsaApiPlugin(
  installDir: string,
  pluginName: string,
): Promise<AsaApiStatus> {
  const trimmed = pluginName.trim();
  if (!isSafePluginName(trimmed)) {
    throw new Error("Invalid plugin name");
  }

  await migrateLegacyDisabledPluginFolders(installDir);

  const pluginsRoot = asaApiPluginsDir(installDir);
  const disabledRoot = asaApiDisabledPluginsDir(installDir);
  const candidates = [
    join(pluginsRoot, trimmed),
    join(disabledRoot, trimmed),
    join(pluginsRoot, `${trimmed}${ASA_API_PLUGIN_DISABLED_SUFFIX}`),
  ];

  let removed = false;
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    await rm(dir, { recursive: true, force: true });
    removed = true;
  }
  if (!removed) {
    throw new Error(`Plugin "${trimmed}" was not found on disk`);
  }

  return readAsaApiStatus(installDir);
}
