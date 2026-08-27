import { HardDrives } from "@phosphor-icons/react";
import { Button, Group, Text, Title, Tooltip } from "@mantine/core";
import type { ReactElement } from "react";
import classes from "../../BackupsPage.module.css";

interface Props {
  title: string;
  subtitle: string;
  showManualCreate: boolean;
  createBlocked: boolean;
  createTooltip: string;
  createLoading: boolean;
  createDisabled: boolean;
  onCreate: () => void;
}

export function ServerBackupHeader(props: Props): ReactElement {
  return (
    <Group
      justify="space-between"
      wrap="wrap"
      gap="sm"
      align="flex-end"
      className={classes.embeddedHeader}
      data-server-backup-header
    >
      <div>
        <Title order={4}>{props.title}</Title>
        <Text size="sm" c="dimmed">
          {props.subtitle}
        </Text>
      </div>
      {props.showManualCreate && (
        <Tooltip label={props.createTooltip}>
          <Button
            size="sm"
            leftSection={<HardDrives size={16} />}
            onClick={props.onCreate}
            loading={props.createLoading}
            disabled={props.createDisabled}
            data-cta-prominence="primary"
          >
            Backup
          </Button>
        </Tooltip>
      )}
    </Group>
  );
}
