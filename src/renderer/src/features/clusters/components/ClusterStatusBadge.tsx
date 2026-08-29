import type { ReactElement } from "react";
import { Text } from "@mantine/core";
import type { ClusterComplianceReport } from "@shared/types";

interface Props {
  report: ClusterComplianceReport;
  size?: "sm" | "md" | "lg";
}

export function ClusterStatusBadge({ report, size = "sm" }: Props): ReactElement {
  const hasWarnings = report.issues.some((issue) => issue.severity === "warning");
  const tone = report.ok ? (hasWarnings ? "warn" : "ok") : "bad";
  const label = report.ok ? (hasWarnings ? "Warnings" : "Ready") : "Errors";
  const textSize = size === "lg" || size === "md" ? "sm" : "xs";

  return (
    <Text
      size={textSize}
      fw={600}
      span
      data-cluster-status={label}
      data-tone={tone}
      c={tone === "ok" ? "ok.5" : tone === "warn" ? "fossil.4" : "red.6"}
    >
      {label}
    </Text>
  );
}
