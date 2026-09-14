import type { ReactElement, ReactNode } from "react";
import { Alert } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";

interface Props {
  storageKey: string;
  title: string;
  children: ReactNode;
}

/** Operator gotcha that can be dismissed and stays dismissed on this PC. */
export function DismissibleHint(props: Props): ReactElement | null {
  const [dismissed, setDismissed] = useLocalStorage({
    key: props.storageKey,
    defaultValue: false,
  });
  if (dismissed) return null;
  return (
    <Alert
      color="blue"
      variant="light"
      title={props.title}
      withCloseButton
      closeButtonLabel="Dismiss"
      onClose={() => setDismissed(true)}
    >
      {props.children}
    </Alert>
  );
}
