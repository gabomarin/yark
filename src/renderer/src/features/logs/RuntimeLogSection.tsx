import { FileText } from "@phosphor-icons/react";
import { Alert, Group, Select, Stack, Text } from "@mantine/core";
import type { ReactNode, ReactElement } from "react";
import { ConsoleSurface } from "@ui/ConsoleSurface/ConsoleSurface";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import classes from "./LogsPage.module.css";
import {
  filterRuntimeLogLines,
  formatRuntimeLogLinesForDisplay,
  RUNTIME_SOURCE_FILTER_OPTIONS,
  type RuntimeLogSourceFilter,
} from "./model/serverLogsFormat";

interface Props {
  loading: boolean;
  runtimeLogLines: string[] | null;
  sourceFilter: RuntimeLogSourceFilter;
  onSourceFilterChange: (value: RuntimeLogSourceFilter) => void;
  clearAction: ReactNode;
  /** Show while Version.dll / plugins delay ShooterGame.log (#243). */
  asaApiLoading?: boolean;
}

export function RuntimeLogSection(props: Props): ReactElement {
  const lines = props.runtimeLogLines ?? [];
  const filtered = formatRuntimeLogLinesForDisplay(
    filterRuntimeLogLines(lines, props.sourceFilter),
  );
  const showAsaApiLoading = props.asaApiLoading === true;

  return (
    <div className={classes.fillPanel}>
      <Stack gap="sm" className={classes.panelStack}>
        {showAsaApiLoading ? (
          <Alert color="blue" variant="light" title="Loading Ark Server API">
            Version.dll and plugins are loading. The server window can take a
            minute; Runtime stays quiet until ShooterGame.log starts writing.
          </Alert>
        ) : null}
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
          <Text c="dimmed">Loading runtime log…</Text>
        ) : props.runtimeLogLines === null || lines.length === 0 ? (
          <EmptyState
            layout="stacked"
            icon={<FileText size={24} />}
            title={
              showAsaApiLoading ? "Waiting for server log" : "No runtime output"
            }
            description={
              showAsaApiLoading
                ? "System messages appear under All sources / System. Server log lines start when the game finishes loading the API."
                : "Output appears while the server is running (or after a recent run)."
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            layout="stacked"
            icon={<FileText size={24} />}
            title="No lines for this source"
            description={
              showAsaApiLoading
                ? "Try All sources or System — Server log stays empty until ShooterGame.log starts."
                : "Try All sources, or wait for output from System, Server log, or Process."
            }
          />
        ) : (
          <ConsoleSurface
            fill
            className={classes.squareConsole}
            text={filtered.join("\n")}
            data-logs-scroll-region="runtime"
          />
        )}
      </Stack>
    </div>
  );
}
