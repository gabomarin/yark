import { FunnelSimple } from "@phosphor-icons/react";
import { Badge, Button, Group, Select } from "@mantine/core";
import type { ReactElement } from "react";
import { SearchField } from "@ui/SearchField/SearchField";
import type { IniFilterId } from "../../iniModel";
import classes from "./ConfigurationEditor.module.css";

interface CategoryOption {
  value: string;
  label: string;
}

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  filter: IniFilterId;
  onFilterChange: (value: IniFilterId) => void;
  categoryOptions: CategoryOption[];
  dirty: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

export function ConfigurationEditorFilterBar(props: Props): ReactElement {
  const {
    search,
    onSearchChange,
    filter,
    onFilterChange,
    categoryOptions,
    dirty,
    onCollapseAll,
    onExpandAll,
  } = props;

  return (
    <Group gap="sm" align="center" className={classes.filterBar}>
      <SearchField
        className={classes.search}
        size="xs"
        placeholder="Search settings"
        label="Search settings"
        value={search}
        onChange={onSearchChange}
      />
      <Select
        className={classes.categorySelect}
        aria-label="Filter by category"
        leftSection={<FunnelSimple size={15} />}
        value={filter}
        data={categoryOptions}
        searchable
        allowDeselect={false}
        nothingFoundMessage="No categories"
        onChange={(value) => onFilterChange((value ?? "all") as IniFilterId)}
      />
      <Button size="xs" variant="light" onClick={onCollapseAll}>
        Collapse
      </Button>
      <Button size="xs" variant="light" onClick={onExpandAll}>
        Expand
      </Button>
      {dirty && (
        <Badge color="yellow" variant="light">
          Unsaved
        </Badge>
      )}
    </Group>
  );
}
