import type { ReactElement, ReactNode } from "react";
import { Modal, Text } from "@mantine/core";
import classes from "./AppPanelModal.module.css";

interface Props {
  opened: boolean;
  onClose: () => void;
  title: string;
  meta?: string;
  size?: number | string;
  children: ReactNode;
}

export function AppPanelModal(props: Props): ReactElement {
  return (
    <Modal.Root
      opened={props.opened}
      onClose={props.onClose}
      centered
      size={props.size ?? 672}
      radius="md"
      classNames={{
        content: classes.content,
        header: classes.header,
        body: classes.body,
        title: classes.title,
      }}
    >
      <Modal.Overlay backgroundOpacity={0.5} color="#000" />
      <Modal.Content radius="md">
        <Modal.Header>
          <div className={classes.headerTop}>
            <div>
              <Modal.Title>{props.title}</Modal.Title>
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
          <div className={classes.bodyContent}>{props.children}</div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
