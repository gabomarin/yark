import { Plus } from "@phosphor-icons/react";
import { Button, Group } from "@mantine/core";
import { SearchField } from "@ui/SearchField/SearchField";
import classes from "../OverviewPage.module.css";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateServer: () => void;
}

export function OverviewHeader({ search, onSearchChange, onCreateServer }: Props): JSX.Element {
  return (
    <header className={classes.header}>
      <div>
        <h1 className={classes.title}>Overview</h1>
        <p className={classes.subtitle}>Monitorea y administra todos tus servidores ARK</p>
      </div>
      <Group gap="sm">
        <SearchField
          value={search}
          onChange={onSearchChange}
          label="Buscar servidores"
          placeholder="Buscar servidores..."
        />
        <Button leftSection={<Plus size={16} />} onClick={onCreateServer}>
          Nuevo servidor
        </Button>
      </Group>
    </header>
  );
}