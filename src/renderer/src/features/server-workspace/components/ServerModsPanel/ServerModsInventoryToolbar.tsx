import type { ReactElement } from "react";
import { Button, CheckIcon, CloseButton, Combobox, Group, Input, InputBase, Text, useCombobox } from "@mantine/core";
import { CaretDown } from "@phosphor-icons/react";
import { useUiDensity } from "@app/AppProviders";
import { SearchField } from "@ui/SearchField/SearchField";
import searchFieldClasses from "@ui/SearchField/SearchField.module.css";
import {
  EMPTY_SERVER_MODS_INVENTORY_FILTER,
  isServerModsInventoryFilterActive,
  type ServerModsInventoryFilter,
  type ServerModsStatusFilter,
} from "./serverModsModel";
import classes from "./ServerModsPanel.module.css";

interface Props {
  filter: ServerModsInventoryFilter;
  visibleCount: number;
  totalCount: number;
  onFilterChange: (next: ServerModsInventoryFilter) => void;
}

const STATUS_OPTIONS: Array<{ value: ServerModsStatusFilter; label: string }> = [
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
  { value: "passive", label: "Passive" },
];

function statusSummary(statuses: ServerModsStatusFilter[]): string {
  return STATUS_OPTIONS.filter((option) => statuses.includes(option.value))
    .map((option) => option.label)
    .join(", ");
}

/**
 * Inventory Find + Status (#636). Sits on the right of the server toolbar next
 * to compact Add — fixed-height Status summary, no pills.
 */
export function ServerModsInventoryToolbar(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const active = isServerModsInventoryFilterActive(props.filter);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const statuses = props.filter.statuses;
  const summary = statusSummary(statuses);

  const toggleStatus = (value: ServerModsStatusFilter) => {
    const next = statuses.includes(value) ? statuses.filter((entry) => entry !== value) : [...statuses, value];
    props.onFilterChange({ ...props.filter, statuses: next });
  };

  return (
    <Group align="flex-end" wrap="wrap" gap="sm" className={classes.inventoryFilters} data-mods-inventory-toolbar>
      <SearchField
        fieldLabel="Find on this server"
        placeholder="Name or Project ID"
        value={props.filter.query}
        size={size}
        className={classes.inventorySearch}
        onChange={(query) => props.onFilterChange({ ...props.filter, query })}
      />
      <Input.Wrapper label="Status" className={classes.inventoryStatus} size={size}>
        <Combobox
          store={combobox}
          withinPortal
          onOptionSubmit={(value) => toggleStatus(value as ServerModsStatusFilter)}
        >
          <Combobox.Target>
            <InputBase
              component="button"
              type="button"
              pointer
              size={size}
              role="combobox"
              aria-label="Status"
              classNames={{
                input: `${searchFieldClasses.input} ${classes.inventoryStatusTrigger}`,
                section: searchFieldClasses.section,
              }}
              rightSection={
                statuses.length > 0 ? (
                  <CloseButton
                    size={size}
                    aria-label="Clear status filter"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onFilterChange({ ...props.filter, statuses: [] });
                    }}
                  />
                ) : (
                  <CaretDown size={14} weight="bold" aria-hidden />
                )
              }
              rightSectionPointerEvents={statuses.length > 0 ? "all" : "none"}
              onClick={() => combobox.toggleDropdown()}
            >
              {summary.length > 0 ? (
                <span className={classes.inventoryStatusSummary}>{summary}</span>
              ) : (
                <Input.Placeholder>All statuses</Input.Placeholder>
              )}
            </InputBase>
          </Combobox.Target>
          <Combobox.Dropdown>
            <Combobox.Options>
              {STATUS_OPTIONS.map((option) => {
                const selected = statuses.includes(option.value);
                return (
                  <Combobox.Option key={option.value} value={option.value} active={selected}>
                    <Group gap="sm" wrap="nowrap">
                      {selected ? <CheckIcon size={12} /> : <span className={classes.inventoryStatusCheckSpacer} />}
                      <span>{option.label}</span>
                    </Group>
                  </Combobox.Option>
                );
              })}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      </Input.Wrapper>
      {active ? (
        <Group gap="xs" wrap="nowrap" align="center">
          <Text size="sm" c="dimmed">
            {props.visibleCount} of {props.totalCount}
          </Text>
          <Button
            size={size}
            variant="default"
            className={classes.addButton}
            styles={{
              root: {
                "--button-height": "var(--mods-add-control-height)",
                height: "var(--mods-add-control-height)",
                minHeight: "var(--mods-add-control-height)",
                paddingBlock: 0,
              },
            }}
            onClick={() => props.onFilterChange(EMPTY_SERVER_MODS_INVENTORY_FILTER)}
          >
            Clear
          </Button>
        </Group>
      ) : null}
    </Group>
  );
}
