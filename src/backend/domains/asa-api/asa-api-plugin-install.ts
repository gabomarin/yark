import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { extractZip } from "../backups/backup-archive";
import type { AsaApiStatus } from "@shared/types";
import {
  asaApiDisabledPluginsDir,
  asaApiPluginsDir,
} from "./asa-api-paths";
import { readAsaApiStatus } from "./asa-api-status";

const IGNORED_TOP_LEVEL = new Set([
  "__macosx",
  ".ds_store",
  "thumbs.db",
]);

function isSafePluginName(name: string): boolean {
  return (
    name.trim().length > 0
    && !/[\\/]/.test(name)
    && !name.includes("..")
    && name !== "."
    && name !== ".."
  );
}

function isIgnoredTopLevelName(name: string): boolean {
  return IGNORED_TOP_LEVEL.has(name.toLowerCase());
}

async function listMeaningfulEntries(dir: string): Promise<
  Array<{ name: string; isDirectory: boolean }>
> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => !isIgnoredTopLevelName(e.name))
    .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
}

/**
 * After extracting a plugin zip to staging, find the folder/files to install
 * and the AsaApi plugin name (must match `Name.dll`).
 */
export async function resolvePluginPayloadFromStaging(stagingDir: string): Promise<{
  sourceDir: string;
  pluginName: string;
  /** True when sourceDir is the staging root (flat zip of files). */
  flatLayout: boolean;
}> {
  const entries = await listMeaningfulEntries(stagingDir);
  if (entries.length === 0) {
    throw new Error("Plugin zip is empty");
  }

  const dirs = entries.filter((e) => e.isDirectory);
  const files = entries.filter((e) => !e.isDirectory);

  if (dirs.length === 1 && files.length === 0) {
    const folderName = dirs[0]!.name;
    const pluginDir = join(stagingDir, folderName);
    const dlls = (await readdir(pluginDir)).filter((name) =>
      name.toLowerCase().endsWith(".dll"),
    );
    if (dlls.length === 0) {
      throw new Error(
        `Plugin folder "${folderName}" has no .dll. Folder name should match Name.dll.`,
      );
    }
    const matched = dlls.find(
      (dll) =>
        basename(dll, extname(dll)).toLowerCase() === folderName.toLowerCase(),
    );
    const dllName = matched ?? (dlls.length === 1 ? dlls[0]! : null);
    if (dllName === null) {
      throw new Error(
        `Plugin folder "${folderName}" has multiple DLLs and none match the folder name.`,
      );
    }
    const pluginName = basename(dllName, extname(dllName));
    if (!isSafePluginName(pluginName)) {
      throw new Error(`Invalid plugin name derived from "${dllName}"`);
    }
    return { sourceDir: pluginDir, pluginName, flatLayout: false };
  }

  const rootDlls = files.filter((f) => f.name.toLowerCase().endsWith(".dll"));
  if (dirs.length === 0 && rootDlls.length === 1) {
    const pluginName = basename(rootDlls[0]!.name, extname(rootDlls[0]!.name));
    if (!isSafePluginName(pluginName)) {
      throw new Error(`Invalid plugin name derived from "${rootDlls[0]!.name}"`);
    }
    return { sourceDir: stagingDir, pluginName, flatLayout: true };
  }

  throw new Error(
    "Plugin zip must contain either one plugin folder (with Name.dll) or a single .dll at the root.",
  );
}

async function moveDirContents(fromDir: string, toDir: string): Promise<void> {
  await mkdir(toDir, { recursive: true });
  for (const name of await readdir(fromDir)) {
    await rename(join(fromDir, name), join(toDir, name));
  }
}

/**
 * Install an AsaApi plugin from a local zip into `ArkApi\\Plugins\\<Name>`.
 * Replaces an existing Plugins or Disabled_Plugins copy of the same name.
 */
export async function installAsaApiPluginFromZip(
  installDir: string,
  zipPath: string,
): Promise<AsaApiStatus> {
  const trimmedZip = zipPath.trim();
  if (trimmedZip.length === 0 || !trimmedZip.toLowerCase().endsWith(".zip")) {
    throw new Error("Choose a .zip plugin archive");
  }
  if (!existsSync(trimmedZip)) {
    throw new Error(`Plugin zip not found: ${trimmedZip}`);
  }
  const zipStat = await stat(trimmedZip);
  if (!zipStat.isFile()) {
    throw new Error("Plugin zip path is not a file");
  }

  const staging = await mkdtemp(join(tmpdir(), "yark-asa-plugin-"));
  try {
    await extractZip(trimmedZip, staging);
    const payload = await resolvePluginPayloadFromStaging(staging);
    const pluginsRoot = asaApiPluginsDir(installDir);
    const disabledRoot = asaApiDisabledPluginsDir(installDir);
    const dest = join(pluginsRoot, payload.pluginName);
    const disabledDest = join(disabledRoot, payload.pluginName);

    await mkdir(pluginsRoot, { recursive: true });
    if (existsSync(disabledDest)) {
      await rm(disabledDest, { recursive: true, force: true });
    }
    if (existsSync(dest)) {
      await rm(dest, { recursive: true, force: true });
    }

    if (payload.flatLayout) {
      await moveDirContents(payload.sourceDir, dest);
    } else if (basename(payload.sourceDir).toLowerCase() === payload.pluginName.toLowerCase()) {
      await rename(payload.sourceDir, dest);
    } else {
      // Folder name did not match DLL — install under the DLL-derived name.
      await moveDirContents(payload.sourceDir, dest);
    }
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }

  return readAsaApiStatus(installDir);
}
