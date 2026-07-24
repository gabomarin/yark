import { Plus } from "@phosphor-icons/react";
import { Button, Checkbox, Group, Stack } from "@mantine/core";
import { SearchField } from "@ui/SearchField/SearchField";
import classes from "../OverviewPage.module.css";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateServer: () => void;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
}

export function OverviewHeader({
  search,
  onSearchChange,
  onCreateServer,
  openNativeTerminalOnStart,
  onOpenNativeTerminalOnStartChange,
}: Props): JSX.Element {
  return (
    <header className={classes.header}>
      <div>
        <h1 className={classes.title}>Overview</h1>
        <p className={classes.subtitle}>Monitorea y administra todos tus servidores ARK</p>
      </div>
      <Stack gap="xs" align="flex-end" className={classes.headerActions}>
        <Group gap="sm" wrap="wrap" justify="flex-end">
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
        <Checkbox
          checked={openNativeTerminalOnStart}
          onChange={(event) => onOpenNativeTerminalOnStartChange(event.currentTarget.checked)}
          label="Mostrar consola del servidor al iniciar"
        />
      </Stack>
    </header>
  );
}