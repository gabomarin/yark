import { Broom } from "@phosphor-icons/react";
import { ActionIcon, Group, Text, Title, Tooltip } from "@mantine/core";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import type { ReactElement, ReactNode } from "react";
import classes from "../../LogsPage.module.css";

export function LogsClearAction(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <Tooltip label={props.label}>
      <span>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label={props.label}
          onClick={props.onClick}
          disabled={props.disabled === true}
        >
          <Broom size={16} />
        </ActionIcon>
      </span>
    </Tooltip>
  );
}

export function LogsTabIntro(props: {
  title: string;
  purpose: string;
  useWhen: string;
  action?: React.ReactNode;
}): ReactElement {
  return (
    <div className={classes.tabIntro}>
      <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
        <Title order={4} className={classes.panelTitle}>
          {props.title}
        </Title>
        {props.action}
      </Group>
      <Text size="sm">{props.purpose}</Text>
      <Text size="xs" c="dimmed">
        Use when: {props.useWhen}
      </Text>
    </div>
  );
}

export function LogsDetailItem(props: {
  label: string;
  value: string;
  icon: ReactNode;
}): ReactElement {
  return (
    <div className={classes.detailItem}>
      <Text className={classes.detailLabel}>
        {props.icon}
        {props.label}
      </Text>
      <Text size="xs" className={classes.detailValue}>
        {props.value}
      </Text>
    </div>
  );
}

export function LogsEmptyState(props: {
  icon: ReactNode;
  title: string;
  description: string;
}): ReactElement {
  return (
    <EmptyState
      layout="stacked"
      icon={props.icon}
      title={props.title}
      description={props.description}
    />
  );
}
