import type { ReactElement } from "react";
import { Button, MultiSelect, Stack } from "@mantine/core";
import type { BackupStatus, BackupType } from "@shared/types";
import { formatBackupTypeLabel } from "../../model/serverBackupPanelModel";
import type { BackupHistoryMetaFilterState } from "../../backupHistoryMetaFilter";

const STATUS_OPTIONS: Array<{ value: BackupStatus; label: string }> = [
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
];

type Props = {
  filter: BackupHistoryMetaFilterState;
  typeOptions: BackupType[];
  onChange: (next: BackupHistoryMetaFilterState) => void;
  onClear: () => void;
};

/**
 * Popover body for the File/Player column header filter (Status + Type).
 * Filtering is applied by the table; this only edits selection state.
 */
export function BackupHistoryMetaFilter(props: Props): ReactElement {
  const typeData = props.typeOptions.map((type) => ({
    value: type,
    label: formatBackupTypeLabel(type),
  }));
  const active = props.filter.statuses.length > 0 || props.filter.types.length > 0;

  return (
    <Stack gap="xs" maw={280} p={4}>
      <MultiSelect
        size="xs"
        label="Status"
        placeholder="All statuses"
        data={STATUS_OPTIONS}
        value={props.filter.statuses}
        onChange={(values) =>
          props.onChange({
            ...props.filter,
            statuses: values as BackupStatus[],
          })
        }
        clearable
        comboboxProps={{ withinPortal: false }}
      />
      <MultiSelect
        size="xs"
        label="Type"
        placeholder="All types"
        data={typeData}
        value={props.filter.types}
        onChange={(values) =>
          props.onChange({
            ...props.filter,
            types: values as BackupType[],
          })
        }
        clearable
        searchable
        comboboxProps={{ withinPortal: false }}
      />
      <Button size="xs" variant="light" disabled={!active} onClick={props.onClear}>
        Clear filters
      </Button>
    </Stack>
  );
}
