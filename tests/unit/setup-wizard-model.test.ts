import { describe, expect, it } from "vitest";
import {
  canContinueClusterStep,
  pendingClusterFromStep,
  stepsForMode,
  toSyntheticClusterOption,
} from "@features/setup-wizard/setupWizardModel";

describe("setupWizardModel", () => {
  it("uses full first-run steps and a paths-shell resume", () => {
    expect(stepsForMode("first-run")).toEqual([
      "welcome",
      "paths",
      "shell",
      "cluster",
      "action",
    ]);
    expect(stepsForMode("paths-shell")).toEqual(["paths", "shell"]);
  });

  it("allows the cluster step when Cross-ARK is skipped", () => {
    expect(
      canContinueClusterStep({
        shareCluster: false,
        clusterId: "",
        clusterDir: "",
        servers: [],
      }),
    ).toBe(true);
    expect(
      pendingClusterFromStep({
        shareCluster: false,
        clusterId: "ember",
        clusterDir: "D:\\ASA\\Clusters\\Ember",
      }),
    ).toBeNull();
  });

  it("requires a valid identity when sharing a cluster", () => {
    expect(
      canContinueClusterStep({
        shareCluster: true,
        clusterId: "ember",
        clusterDir: "",
        servers: [],
      }),
    ).toBe(false);
    expect(
      canContinueClusterStep({
        shareCluster: true,
        clusterId: "ember",
        clusterDir: "D:\\ASA\\Clusters\\Ember",
        servers: [],
      }),
    ).toBe(true);
    expect(
      pendingClusterFromStep({
        shareCluster: true,
        clusterId: " ember ",
        clusterDir: " D:\\ASA\\Clusters\\Ember ",
      }),
    ).toEqual({
      clusterId: "ember",
      clusterDir: "D:\\ASA\\Clusters\\Ember",
    });
  });

  it("labels the synthetic picker option as from setup", () => {
    expect(
      toSyntheticClusterOption({
        clusterId: "ember",
        clusterDir: "D:\\ASA\\Clusters\\Ember",
      }),
    ).toEqual({
      clusterId: "ember",
      clusterDir: "D:\\ASA\\Clusters\\Ember",
      label: "ember · from setup",
    });
  });
});
