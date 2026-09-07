import type { ReactElement, ReactNode } from "react";
import { Button, Modal, Text } from "@mantine/core";
import classes from "./AppPanelConfirmModal.module.css";

export interface AppPanelConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** Short line under the title (What's new / Quit meta style). */
  meta?: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Defaults to red for destructive confirms. */
  confirmColor?: string;
  confirmLoading?: boolean;
  /** Forwarded to Modal.Content (e.g. data-yark-quit-modal). */
  contentProps?: Record<string, string | undefined>;
  titleProps?: Record<string, string | undefined>;
  confirmProps?: Record<string, string | undefined>;
  size?: number | string;
}

/**
 * Confirm dialog chrome aligned with What's new / Quit YARK (#532).
 * Prefer this over Mantine `openConfirmModal` when the surface should match
 * the panel-style product modals.
 */
export function AppPanelConfirmModal(
  props: AppPanelConfirmModalProps,
): ReactElement {
  const cancelLabel = props.cancelLabel ?? "Cancel";
  const confirmColor = props.confirmColor ?? "red";

  return (
    <Modal.Root
      opened={props.opened}
      onClose={props.onClose}
      centered
      size={props.size ?? 420}
      radius="md"
      classNames={{
        content: classes.content,
        header: classes.header,
        body: classes.body,
        title: classes.title,
      }}
    >
      <Modal.Overlay backgroundOpacity={0.5} color="#000" />
      <Modal.Content radius="md" {...props.contentProps}>
        <Modal.Header>
          <div className={classes.headerTop}>
            <div>
              <Modal.Title {...props.titleProps}>{props.title}</Modal.Title>
              {props.meta !== undefined && props.meta.length > 0 ? (
                <Text size="xs" className={classes.meta}>
                  {props.meta}
                </Text>
              ) : null}
            </div>
            <Modal.CloseButton aria-label="Close" />
          </div>
        </Modal.Header>

        <Modal.Body>
          <div className={classes.copy}>
            {typeof props.children === "string" ? (
              <Text size="sm">{props.children}</Text>
            ) : (
              props.children
            )}
          </div>

          <div className={classes.footer}>
            <Button
              size="compact-xs"
              variant="subtle"
              radius="md"
              onClick={props.onClose}
              disabled={props.confirmLoading === true}
            >
              {cancelLabel}
            </Button>
            <Button
              size="compact-xs"
              radius="md"
              color={confirmColor}
              loading={props.confirmLoading === true}
              onClick={props.onConfirm}
              {...props.confirmProps}
            >
              {props.confirmLabel}
            </Button>
          </div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
