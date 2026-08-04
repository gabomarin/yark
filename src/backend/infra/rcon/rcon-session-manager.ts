import { EventEmitter } from "node:events";
import { RconClient } from "./rcon-client";

export type RconConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface RconSession {
  serverId: string;
  client: RconClient | null;
  status: RconConnectionStatus;
  lastError: string | null;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  host: string;
  port: number;
  password: string;
  /** Serializes commands so ListPlayers polls cannot overlap on one socket. */
  sendQueue: Promise<void>;
  /** Bumps on each connect attempt so late TCP wins do not revive a removed session. */
  connectGeneration: number;
}

export interface RconConnectionInfo {
  serverId: string;
  status: RconConnectionStatus;
  lastError: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY_MS = 2000;
const NO_CONTENT_RESPONSE = "Server received, But no response!!";

/**
 * Manages persistent RCON connections for multiple servers.
 * Handles auto-reconnect with exponential backoff.
 */
export class RconSessionManager extends EventEmitter {
  private sessions = new Map<string, RconSession>();

  /**
   * Starts or ensures a persistent RCON connection for a server.
   * Emits 'status-changed' events with { serverId, status, lastError }.
   */
  async connect(
    serverId: string,
    host: string,
    port: number,
    password: string,
  ): Promise<void> {
    let session = this.sessions.get(serverId);
    if (!session) {
      session = {
        serverId,
        client: null,
        status: "disconnected",
        lastError: null,
        reconnectTimer: null,
        reconnectAttempts: 0,
        host,
        port,
        password,
        sendQueue: Promise.resolve(),
        connectGeneration: 0,
      };
      this.sessions.set(serverId, session);
    } else {
      session.host = host;
      session.port = port;
      session.password = password;
    }

    // Already connected or connecting
    if (session.status === "connected" || session.status === "connecting") {
      return;
    }

    session.connectGeneration += 1;
    const generation = session.connectGeneration;
    this.updateStatus(serverId, "connecting", null);

    try {
      const client = new RconClient(host, port, password);
      await client.connect();

      // disconnect() / a newer connect may have superseded this attempt.
      const current = this.sessions.get(serverId);
      if (
        current !== session ||
        current.connectGeneration !== generation
      ) {
        client.close();
        return;
      }

      session.client = client;
      session.reconnectAttempts = 0;
      this.updateStatus(serverId, "connected", null);

      client.socket?.on("error", (err: Error) => {
        console.error(`[RconSessionManager] Connection error for ${serverId}: ${err.message}`);
        this.handleConnectionLost(serverId, client, err.message);
      });

      client.socket?.on("close", () => {
        console.log(`[RconSessionManager] Connection closed for ${serverId}`);
        this.handleConnectionLost(serverId, client, "Connection closed");
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[RconSessionManager] Failed to connect ${serverId}: ${errorMsg}`);

      const current = this.sessions.get(serverId);
      if (
        current !== session ||
        current.connectGeneration !== generation
      ) {
        return;
      }

      this.updateStatus(serverId, "error", errorMsg);
      this.scheduleReconnect(serverId, host, port, password);
    }
  }

  /**
   * Disconnects and removes the RCON session for a server.
   */
  disconnect(serverId: string): void {
    const session = this.sessions.get(serverId);
    if (!session) return;

    // Invalidate any in-flight connect() so a late TCP auth cannot store
    // a client on a deleted / replaced session.
    session.connectGeneration += 1;

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }

    if (session.client) {
      session.client.close();
      session.client = null;
    }

    this.sessions.delete(serverId);
    this.updateStatus(serverId, "disconnected", null);
  }

  /**
   * Sends an RCON command to a connected server.
   * Commands are queued per server (ASA Source RCON is single-flight).
   * Throws if the session is not connected.
   * The command is sent exactly as trimmed — no rewrite.
   */
  async send(serverId: string, command: string): Promise<string> {
    const session = this.sessions.get(serverId);
    if (!session || !session.client || session.status !== "connected") {
      throw new Error(`RCON not connected for server ${serverId}`);
    }

    const client = session.client;
    const trimmed = command.trim();

    const run = async (): Promise<string> => {
      if (session.client !== client || session.status !== "connected") {
        throw new Error(`RCON not connected for server ${serverId}`);
      }
      try {
        const response = await client.send(trimmed);
        if (response.trim() === NO_CONTENT_RESPONSE) {
          return "";
        }
        return response;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[RconSessionManager] Command failed for ${serverId}: ${errorMsg}`,
        );
        throw err;
      }
    };

    const result = session.sendQueue.then(run, run);
    session.sendQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Returns the current connection status for a server.
   */
  getStatus(serverId: string): RconConnectionInfo {
    const session = this.sessions.get(serverId);
    if (!session) {
      return { serverId, status: "disconnected", lastError: null };
    }
    return {
      serverId,
      status: session.status,
      lastError: session.lastError,
    };
  }

  /**
   * Returns connection info for all active sessions.
   */
  getAllStatus(): RconConnectionInfo[] {
    return Array.from(this.sessions.values()).map((session) => ({
      serverId: session.serverId,
      status: session.status,
      lastError: session.lastError,
    }));
  }

  private handleConnectionLost(
    serverId: string,
    client: RconClient,
    reason: string,
  ): void {
    const session = this.sessions.get(serverId);
    if (!session || session.client !== client) return;

    session.client = null;
    this.updateStatus(serverId, "disconnected", reason);
    this.scheduleReconnect(serverId, session.host, session.port, session.password);
  }

  private scheduleReconnect(
    serverId: string,
    host: string,
    port: number,
    password: string,
  ): void {
    const session = this.sessions.get(serverId);
    if (!session) return;

    if (session.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[RconSessionManager] Max reconnect attempts reached for ${serverId}`);
      this.updateStatus(serverId, "error", "Max reconnect attempts reached");
      return;
    }

    const delay = RECONNECT_BASE_DELAY_MS * (session.reconnectAttempts + 1);
    session.reconnectAttempts++;

    console.log(
      `[RconSessionManager] Scheduling reconnect for ${serverId} in ${delay}ms (attempt ${session.reconnectAttempts})`,
    );

    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null;
      this.connect(serverId, host, port, password).catch((err) => {
        console.error(`[RconSessionManager] Reconnect failed for ${serverId}:`, err);
      });
    }, delay);
  }

  private updateStatus(
    serverId: string,
    status: RconConnectionStatus,
    lastError: string | null,
  ): void {
    const session = this.sessions.get(serverId);
    if (session) {
      session.status = status;
      session.lastError = lastError;
    }

    this.emit("status-changed", {
      serverId,
      status,
      lastError,
    });
  }

  /**
   * Cleanup all sessions (for shutdown).
   */
  shutdown(): void {
    for (const serverId of this.sessions.keys()) {
      this.disconnect(serverId);
    }
    this.sessions.clear();
  }
}
