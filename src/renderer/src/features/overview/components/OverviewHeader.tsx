import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Button, Group } from "@mantine/core";
import { SearchField } from "@ui/SearchField/SearchField";
import classes from "../OverviewPage.module.css";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateServer: () => void;
  onCheckUpdates: () => void;
  checkingUpdates?: boolean;
}

export function OverviewHeader({
  search,
  onSearchChange,
  onCreateServer,
  onCheckUpdates,
  checkingUpdates = false,
}: Props): JSX.Element {
  return (
    <header className={classes.header}>
      <div>
        <h1 className={classes.title}>Servidores</h1>
        <p className={classes.subtitle}>Monitorea y administra todos tus servidores ARK</p>
      </div>
      <Group gap="sm" wrap="wrap" justify="flex-end" className={classes.headerActions}>
        <SearchField
          value={search}
          onChange={onSearchChange}
          label="Buscar servidores"
          placeholder="Buscar servidores..."
        />
        <Button
          variant="light"
          color="indigo"
          leftSection={<MagnifyingGlass size={16} />}
          onClick={onCheckUpdates}
          loading={checkingUpdates}
        >
          Verificar actualizaciones
        </Button>
        <Button leftSection={<Plus size={16} />} onClick={onCreateServer}>
          Nuevo servidor
        </Button>
      </Group>
    </header>
  );
}
