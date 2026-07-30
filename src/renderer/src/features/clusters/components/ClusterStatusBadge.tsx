import type { ReactElement } from "react";
import { CheckCircle, Warning, WarningCircle } from "@phosphor-icons/react";
import { Badge } from "@mantine/core";
import type { ClusterComplianceReport } from "@shared/types";

interface Props {
  report: ClusterComplianceReport;
  size?: "sm" | "md" | "lg";
}

export function ClusterStatusBadge({ report, size = "sm" }: Props): ReactElement {
  const hasWarnings = report.issues.some((issue) => issue.severity === "warning");
  const color = report.ok ? (hasWarnings ? "yellow" : "teal") : "red";
  const label = report.ok ? (hasWarnings ? "Warnings" : "Ready") : "Errors";

  return (
    <Badge
      size={size}
      color={color}
      variant="light"
      leftSection={
        report.ok ? (
          hasWarnings ? (
            <Warning size={12} />
          ) : (
            <CheckCircle size={12} />
          )
        ) : (
          <WarningCircle size={12} />
        )
      }
    >
      {label}
    </Badge>
  );
}
