import { type ReactElement, useSyncExternalStore, useEffect, useState } from "react";
import { Tooltip, Badge } from "@mantine/core";

type RconConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface RconConnectionInfo {
  serverId: string;
  status: RconConnectionStatus;
  lastError: string | null;
}

// Store for RCON status
class RconStatusStore {
  private statuses = new Map<string, RconConnectionInfo>();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(serverId: string): RconConnectionInfo {
    let status = this.statuses.get(serverId);
    if (!status) {
      status = {
        serverId,
        status: "disconnected",
        lastError: null,
      };
      this.statuses.set(serverId, status);
    }
    return status;
  }

  updateStatus(info: RconConnectionInfo): void {
    this.statuses.set(info.serverId, info);
    this.listeners.forEach((listener) => listener());
  }

  clear(): void {
    this.statuses.clear();
    this.listeners.forEach((listener) => listener());
  }
}

const rconStatusStore = new RconStatusStore();

interface Props {
  serverId: string;
}

export function RconStatusIcon({ serverId }: Props): ReactElement {
  const [retrying, setRetrying] = useState(false);
  const status = useSyncExternalStore(
    (listener) => rconStatusStore.subscribe(listener),
    () => rconStatusStore.getSnapshot(serverId),
  );

  // Setup IPC listener and fetch initial status on mount
  useEffect(() => {
    if (!window.api) return;

    // Subscribe to push events
    const unsubscribe = window.api.onRconStatusChanged((payload) => {
      rconStatusStore.updateStatus(payload);
    });

    // Fetch initial status
    window.api.getRconStatus(serverId).then((result) => {
      if (result.ok && result.data) {
        rconStatusStore.updateStatus(result.data);
      }
    });

    return unsubscribe;
  }, [serverId]);

  const statusConfig = {
    disconnected: {
      color: "gray",
      label: "RCON: disconnected - click to retry",
      canRetry: true,
    },
    connecting: {
      color: "yellow",
      label: "RCON: connecting…",
      canRetry: false,
    },
    connected: {
      color: "green",
      label: "RCON: connected",
      canRetry: false,
    },
    error: {
      color: "red",
      label: "RCON: error - click to retry",
      canRetry: true,
    },
  }[status.status];
  const canRetry = statusConfig.canRetry && !retrying;

  const retryConnection = async (): Promise<void> => {
    if (!canRetry) return;
    setRetrying(true);
    try {
      await window.api.retryRconConnection(serverId);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Tooltip
      label={status.lastError ?? statusConfig.label}
      withArrow
      position="bottom"
    >
      <Badge
        component="button"
        type="button"
        size="sm"
        variant="dot"
        color={statusConfig.color}
        disabled={!canRetry}
        onClick={() => void retryConnection()}
        style={{ cursor: canRetry ? "pointer" : "default" }}
      >
        {retrying ? "RCON: connecting…" : statusConfig.label}
      </Badge>
    </Tooltip>
  );
}
