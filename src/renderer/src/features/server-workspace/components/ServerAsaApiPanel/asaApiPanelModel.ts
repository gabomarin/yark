import type { AsaApiPluginInfo } from "@shared/types";

export type AsaApiBusyKind =
  | "install"
  | "uninstall"
  | "addPlugin"
  | "deletePlugin"
  | "pluginToggle"
  | "flags"
  | "clearCache";

export type AsaApiConfirm =
  | { kind: "uninstall" }
  | { kind: "clearCache" }
  | { kind: "deletePlugin"; plugin: AsaApiPluginInfo };

export function pluginCountLabel(plugins: AsaApiPluginInfo[]): string {
  const enabled = plugins.filter((p) => p.enabled).length;
  if (plugins.length === 0) return "None yet";
  return `${plugins.length} total · ${enabled} on`;
}

export function asaApiInjectLabel(asaOn: boolean, loaderOn: boolean): string {
  if (!asaOn) return "Off";
  return loaderOn ? "Loader" : "Version.dll";
}

export function asaApiConfirmCopy(confirm: AsaApiConfirm | null): {
  title: string;
  meta: string | undefined;
  confirmLabel: string;
  busyKind: AsaApiBusyKind | null;
} {
  if (confirm === null) {
    return {
      title: "",
      meta: undefined,
      confirmLabel: "Confirm",
      busyKind: null,
    };
  }
  if (confirm.kind === "uninstall") {
    return {
      title: "Remove Ark Server API?",
      meta: "Removes API files from this server folder",
      confirmLabel: "Remove",
      busyKind: "uninstall",
    };
  }
  if (confirm.kind === "clearCache") {
    return {
      title: "Clear download cache?",
      meta: "YARK app data only – not this server’s files",
      confirmLabel: "Clear cache",
      busyKind: "clearCache",
    };
  }
  return {
    title: `Delete ${confirm.plugin.name}?`,
    meta: "Deletes the plugin folder from this install",
    confirmLabel: "Delete plugin",
    busyKind: "deletePlugin",
  };
}
