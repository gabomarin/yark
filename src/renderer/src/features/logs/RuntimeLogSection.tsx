import { FileText } from "@phosphor-icons/react";
import { Group, Select, Stack, Text } from "@mantine/core";
import type { ReactNode, ReactElement } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { ConsoleSurface } from "@ui/ConsoleSurface/ConsoleSurface";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import classes from "./LogsPage.module.css";
import {
  filterRuntimeLogLines,
  formatRuntimeLogLinesForDisplay,
  RUNTIME_SOURCE_FILTER_OPTIONS,
  type RuntimeLogSourceFilter,
} from "./serverLogsFormat";

interface Props {
  loading: boolean;
  runtimeLogLines: string[] | null;
  sourceFilter: RuntimeLogSourceFilter;
  onSourceFilterChange: (value: RuntimeLogSourceFilter) => void;
  clearAction: ReactNode;
}

export function RuntimeLogSection(props: Props): ReactElement {
  const lines = props.runtimeLogLines ?? [];
  const filtered = formatRuntimeLogLinesForDisplay(
    filterRuntimeLogLines(lines, props.sourceFilter),
  );

  return (
    <AppSurfaceCard fill className={classes.fillPanel}>
      <Stack gap="sm" className={classes.panelStack}>
        <Group justify="space-between" align="center" gap="sm" wrap="wrap">
          <Select
            aria-label="Source"
            data={RUNTIME_SOURCE_FILTER_OPTIONS}
            value={props.sourceFilter}
            onChange={(value) => {
              if (
                value === "all" ||
                value === "system" ||
                value === "asa" ||
                value === "process"
              ) {
                props.onSourceFilterChange(value);
              }
            }}
            allowDeselect={false}
            size="xs"
            className={classes.runtimeSourceFilter}
            data-testid="runtime-source-filter"
          />
          {props.clearAction}
        </Group>
        {props.loading ? (
          <Text c="dimmed">Loading runtime log...</Text>
        ) : props.runtimeLogLines === null || lines.length === 0 ? (
          <EmptyState
            layout="stacked"
            icon={<FileText size={24} />}
            title="No runtime output"
            description="Output appears while the server is running (or after a recent run)."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            layout="stacked"
            icon={<FileText size={24} />}
            title="No lines for this source"
            description="Try All sources, or wait for output from System, Server log, or Process."
          />
        ) : (
          <ConsoleSurface
            fill
            text={filtered.join("\n")}
            data-logs-scroll-region="runtime"
          />
        )}
      </Stack>
    </AppSurfaceCard>
  );
}
