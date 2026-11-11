import { ArrowsInLineVertical, ArrowsOutLineVertical, FunnelSimple, SortAscending } from "@phosphor-icons/react";
import { Badge, Button, Group, Tooltip } from "@mantine/core";
import { useState, type ReactElement } from "react";
import { SearchField, searchFieldIconSize } from "@ui/SearchField/SearchField";
import { SelectField } from "@ui/SelectField/SelectField";
import type { IniFilterId, IniSettingsSort } from "../../iniModel";
import classes from "./ConfigurationEditor.module.css";

interface CategoryOption {
  value: string;
  label: string;
}

const SORT_CHOICES: { value: IniSettingsSort; label: string; hint: string }[] = [
  {
    value: "unsorted",
    label: "Unsorted",
    hint: "INI sections, in the order they appear in the file.",
  },
  {
    value: "asInFile",
    label: "By category",
    hint: "Categories such as Rates and Breeding. Settings inside a category stay in file order.",
  },
  {
    value: "alphabetical",
    label: "Alphabetical",
    hint: "The same categories, with setting names from A to Z.",
  },
];

function SortChoiceLabel({ label, hint }: { label: string; hint: string }): ReactElement {
  const [opened, setOpened] = useState(false);
  return (
    <Tooltip
      label={hint}
      opened={opened}
      position="right-start"
      multiline
      maw={280}
      transitionProps={{ duration: 0, exitDuration: 0 }}
    >
      <span
        className={classes.sortOption}
        onMouseEnter={() => setOpened(true)}
        onMouseLeave={() => setOpened(false)}
        onPointerDown={() => setOpened(false)}
      >
        {label}
      </span>
    </Tooltip>
  );
}

function isIniSettingsSort(value: string | null): value is IniSettingsSort {
  return value === "unsorted" || value === "asInFile" || value === "alphabetical";
}

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  filter: IniFilterId;
  onFilterChange: (value: IniFilterId) => void;
  categoryOptions: CategoryOption[];
  dirty: boolean;
  /** Unsaved visual-row count for the active file (may exceed visible filtered rows). */
  unsavedRowCount?: number;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  sort: IniSettingsSort;
  onSortChange: (sort: IniSettingsSort) => void;
}

export function ConfigurationEditorFilterBar(props: Props): ReactElement {
  const {
    search,
    onSearchChange,
    filter,
    onFilterChange,
    categoryOptions,
    dirty,
    unsavedRowCount = 0,
    onCollapseAll,
    onExpandAll,
    sort,
    onSortChange,
  } = props;

  return (
    <Group gap="sm" align="center" wrap="wrap" className={classes.filterBar}>
      <SearchField
        className={classes.search}
        size="xs"
        placeholder="Search settings"
        label="Search settings"
        value={search}
        onChange={onSearchChange}
      />
      <div className={classes.filterControls}>
        <SelectField
          className={classes.fieldControl}
          aria-label="Filter by category"
          leftSection={<FunnelSimple size={searchFieldIconSize("xs")} />}
          value={filter}
          data={categoryOptions}
          searchable
          allowDeselect={false}
          nothingFoundMessage="No categories"
          onChange={(value) => onFilterChange((value ?? "all") as IniFilterId)}
        />
        <SelectField
          className={classes.fieldControl}
          aria-label="Sort settings"
          data-ini-settings-sort={sort}
          leftSection={<SortAscending size={searchFieldIconSize("xs")} />}
          value={sort}
          data={SORT_CHOICES.map((choice) => ({ value: choice.value, label: choice.label }))}
          allowDeselect={false}
          renderOption={({ option }) => {
            const choice = SORT_CHOICES.find((item) => item.value === option.value);
            return <SortChoiceLabel label={option.label} hint={choice?.hint ?? option.label} />;
          }}
          onChange={(value) => {
            if (isIniSettingsSort(value)) onSortChange(value);
          }}
        />
        <div className={classes.filterActions}>
          <Button
            size="xs"
            variant="default"
            color="gray"
            leftSection={<ArrowsInLineVertical size={14} />}
            onClick={onCollapseAll}
          >
            Collapse
          </Button>
          <Button
            size="xs"
            variant="default"
            color="gray"
            leftSection={<ArrowsOutLineVertical size={14} />}
            onClick={onExpandAll}
          >
            Expand
          </Button>
        </div>
        {dirty && (
          <Badge color="attention" variant="light" data-ini-unsaved-count={unsavedRowCount}>
            {unsavedRowCount > 0 ? `Unsaved · ${unsavedRowCount}` : "Unsaved"}
          </Badge>
        )}
      </div>
    </Group>
  );
}
