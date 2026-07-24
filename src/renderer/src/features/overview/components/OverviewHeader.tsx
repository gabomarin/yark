import { ArrowsClockwise, Plus } from "@phosphor-icons/react";
import { Button, Group } from "@mantine/core";
import classes from "../OverviewPage.module.css";

interface Props {
  onCreateServer: () => void;
  onCheckUpdates: () => void;
  checkingUpdates?: boolean;
}

export function OverviewHeader({
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
        <Button
          variant="subtle"
          color="gray"
          leftSection={<ArrowsClockwise size={16} />}
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
