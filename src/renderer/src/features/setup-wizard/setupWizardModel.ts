import type { ServerProfile } from "@shared/types";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import { normalizeWindowsPath } from "@shared/server-install-path";
import {
  getClusterDirFormError,
  getClusterIdFormError,
} from "@features/clusters/createClusterModel";

export type SetupWizardMode = "first-run" | "paths-shell";

export type SetupWizardStepId =
  | "welcome"
  | "paths"
  | "shell"
  | "cluster"
  | "action";

export const FIRST_RUN_STEPS: SetupWizardStepId[] = [
  "welcome",
  "paths",
  "shell",
  "cluster",
  "action",
];

export const PATHS_SHELL_STEPS: SetupWizardStepId[] = ["paths", "shell"];

export const SETUP_WIZARD_STEP_LABELS: Record<SetupWizardStepId, string> = {
  welcome: "Welcome",
  paths: "Paths",
  shell: "Windows",
  cluster: "Cluster",
  action: "First server",
};

export type PendingSetupCluster = {
  clusterId: string;
  clusterDir: string;
};

export function stepsForMode(mode: SetupWizardMode): SetupWizardStepId[] {
  return mode === "first-run" ? FIRST_RUN_STEPS : PATHS_SHELL_STEPS;
}

export function suggestSetupClusterDir(
  defaultBaseFolder: string | null,
  clusterId: string,
): string {
  const base = normalizeWindowsPath(defaultBaseFolder ?? "");
  const id = clusterId.trim();
  if (base.length === 0 || id.length === 0) {
    return "";
  }
  return `${base}\\Clusters\\${id}`;
}

/** Keep an auto-suggested cluster folder aligned with the current default base. */
export function syncAutoSuggestedClusterDir(input: {
  shareCluster: boolean;
  dirAutoSuggested: boolean;
  defaultBaseFolder: string | null;
  clusterId: string;
}): { clusterDir: string; dirAutoSuggested: boolean; markDirTouched: boolean } | null {
  if (!input.shareCluster || !input.dirAutoSuggested) {
    return null;
  }
  const clusterDir = suggestSetupClusterDir(input.defaultBaseFolder, input.clusterId);
  return {
    clusterDir,
    dirAutoSuggested: clusterDir.length > 0,
    markDirTouched: clusterDir.length === 0,
  };
}

export function toSyntheticClusterOption(
  pending: PendingSetupCluster,
): KnownClusterOption {
  return {
    clusterId: pending.clusterId,
    clusterDir: pending.clusterDir,
    label: `${pending.clusterId} · from setup`,
  };
}

export function canContinueClusterStep(input: {
  shareCluster: boolean;
  clusterId: string;
  clusterDir: string;
  servers: ServerProfile[];
}): boolean {
  if (!input.shareCluster) {
    return true;
  }
  return (
    getClusterIdFormError(input.clusterId, input.clusterDir, input.servers) ===
      null && getClusterDirFormError(input.clusterDir) === null
  );
}

export function pendingClusterFromStep(input: {
  shareCluster: boolean;
  clusterId: string;
  clusterDir: string;
}): PendingSetupCluster | null {
  if (!input.shareCluster) {
    return null;
  }
  return {
    clusterId: input.clusterId.trim(),
    clusterDir: input.clusterDir.trim(),
  };
}
