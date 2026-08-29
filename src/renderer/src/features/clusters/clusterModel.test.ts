import { describe, expect, it } from "vitest";
import { formatClusterSummaryLine } from "./clusterModel";

describe("formatClusterSummaryLine (#470)", () => {
  it("joins counts into one sentence", () => {
    expect(
      formatClusterSummaryLine({
        clusterCount: 2,
        readyCount: 1,
        errorCount: 1,
        warningOnlyCount: 0,
        unclusteredCount: 0,
        dirWithoutIdCount: 0,
      }),
    ).toBe("2 clusters · 1 ready · 1 with errors");
  });

  it("uses singular cluster and includes optional clauses", () => {
    expect(
      formatClusterSummaryLine({
        clusterCount: 1,
        readyCount: 1,
        errorCount: 0,
        warningOnlyCount: 1,
        unclusteredCount: 1,
        dirWithoutIdCount: 2,
      }),
    ).toBe(
      "1 cluster · 1 ready · 1 with warnings · 1 server not in a cluster · 2 with directory but no Cluster ID",
    );
  });
});
