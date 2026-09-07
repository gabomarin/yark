import type { AsaApiStatus } from "@shared/types";
import { clearAsaApiDownloadCache } from "./asa-api-cache";
import {
  installAsaApiIntoInstall,
  type InstallAsaApiOptions,
} from "./asa-api-install";
import { installAsaApiPluginFromZip } from "./asa-api-plugin-install";
import { asaApiPluginsDir, asaWin64Dir } from "./asa-api-paths";
import {
  deleteAsaApiPlugin,
  readAsaApiStatus,
  setAsaApiPluginEnabled,
} from "./asa-api-status";
import { uninstallAsaApiFromInstall } from "./asa-api-uninstall";

export class AsaApiService {
  constructor(private readonly cacheDir: string) {}

  getStatus(installDir: string): Promise<AsaApiStatus> {
    return readAsaApiStatus(installDir);
  }

  install(
    installDir: string,
    options: Omit<InstallAsaApiOptions, "cacheDir">,
  ): Promise<AsaApiStatus> {
    return installAsaApiIntoInstall(installDir, {
      ...options,
      cacheDir: this.cacheDir,
    });
  }

  uninstall(installDir: string): Promise<AsaApiStatus> {
    return uninstallAsaApiFromInstall(installDir);
  }

  clearDownloadCache(): Promise<void> {
    return clearAsaApiDownloadCache(this.cacheDir);
  }

  setPluginEnabled(
    installDir: string,
    pluginName: string,
    enabled: boolean,
  ): Promise<AsaApiStatus> {
    return setAsaApiPluginEnabled(installDir, pluginName, enabled);
  }

  deletePlugin(installDir: string, pluginName: string): Promise<AsaApiStatus> {
    return deleteAsaApiPlugin(installDir, pluginName);
  }

  installPluginFromZip(
    installDir: string,
    zipPath: string,
  ): Promise<AsaApiStatus> {
    return installAsaApiPluginFromZip(installDir, zipPath);
  }

  win64Path(installDir: string): string {
    return asaWin64Dir(installDir);
  }

  pluginsPath(installDir: string): string {
    return asaApiPluginsDir(installDir);
  }

  downloadCachePath(): string {
    return this.cacheDir;
  }
}
