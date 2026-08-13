import type { ReactElement, ReactNode } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button, Group, Stack, Text } from "@mantine/core";
import classes from "./ServerForm.module.css";

interface Props {
  title: string;
  subtitle: string;
  submitLabel: string;
  submitSize: "xs" | "sm";
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  children: ReactNode;
  /** Distinguishes create vs edit overlay for tests / visual helpers. */
  formKind?: "create" | "edit";
}

/** Full-main create/edit chrome: title, scroll body, modal-style footer (#292). */
export function ServerFormShellPage(props: Props): ReactElement {
  return (
    <div
      className={classes.formShell}
      data-server-form={props.formKind ?? "create"}
    >
      <header className={classes.formHeader}>
        <h1 className={classes.formTitle}>{props.title}</h1>
        <Text c="dimmed">{props.subtitle}</Text>
      </header>
      <div className={classes.formBodyScroll} data-server-form-scroll>
        <div className={classes.formInner}>
          <Stack gap="md">{props.children}</Stack>
        </div>
      </div>
      <footer className={classes.formFooter}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Button
            variant="default"
            leftSection={<ArrowLeft size={16} />}
            onClick={props.onCancel}
          >
            Back
          </Button>
          <Button
            size={props.submitSize}
            onClick={props.onSubmit}
            loading={props.saving}
          >
            {props.submitLabel}
          </Button>
        </Group>
      </footer>
    </div>
  );
}
