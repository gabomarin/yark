import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ClusterComplianceReport } from "@shared/types";
import { ClusterStatusBadge } from "./ClusterStatusBadge";

const base: ClusterComplianceReport = {
  clusterId: "alpha",
  ok: true,
  members: ["srv-a"],
  issues: [],
  checkedAt: "2026-07-26T09:00:00.000Z",
};

describe("ClusterStatusBadge", () => {
  it("uses semantic data-tone, not Mantine shade props", () => {
    render(
      <AppProviders>
        <ClusterStatusBadge report={base} />
      </AppProviders>,
    );
    const label = screen.getByText("Ready");
    expect(label).toHaveAttribute("data-tone", "ok");
    expect(label).not.toHaveAttribute("data-cluster-status");
    expect(document.querySelector(".mantine-Badge-root")).toBeNull();
  });

  it("marks warnings and errors", () => {
    render(
      <AppProviders>
        <ClusterStatusBadge
          report={{
            ...base,
            issues: [{ serverId: "srv-a", severity: "warning", message: "port" }],
          }}
        />
        <ClusterStatusBadge
          report={{
            ...base,
            clusterId: "beta",
            ok: false,
            issues: [{ serverId: "srv-b", severity: "error", message: "dir" }],
          }}
        />
      </AppProviders>,
    );
    expect(screen.getByText("Warnings")).toHaveAttribute("data-tone", "warn");
    expect(screen.getByText("Errors")).toHaveAttribute("data-tone", "bad");
  });
});
