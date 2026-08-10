import { Alert, Button, Stack, Text } from "@mantine/core";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Remount / reset key — typically workspace tab id + server id. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isolates workspace tab crashes so Mods/Launch/Logs throws do not blank the App shell (#209).
 */
export class WorkspacePanelErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(previous: Props): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Workspace panel crashed", error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <Alert color="red" variant="light" title="This panel hit an error">
          <Stack gap="sm">
            <Text size="sm">
              The rest of YARK is still running. Retry this panel, or switch tabs
              and come back.
            </Text>
            <Text size="xs" c="dimmed" style={{ wordBreak: "break-word" }}>
              {this.state.error.message || "Unknown error"}
            </Text>
            <Button size="xs" variant="light" onClick={this.handleRetry} w="fit-content">
              Retry panel
            </Button>
          </Stack>
        </Alert>
      );
    }
    return this.props.children;
  }
}
