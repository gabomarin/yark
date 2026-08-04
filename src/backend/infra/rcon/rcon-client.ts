import { Socket } from "node:net";

const AUTH = 3;
const AUTH_RESPONSE = 2;
const EXEC_COMMAND = 2;
const RESPONSE_VALUE = 0;

function encodePacket(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(14 + bodyBuf.length);
  buf.writeInt32LE(10 + bodyBuf.length, 0); // size
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  // trailing two null bytes already zero from alloc
  return buf;
}

interface Packet {
  id: number;
  type: number;
  body: string;
}

/**
 * Minimal Source RCON protocol client, enough for
 * saveworld, broadcast, kick/ban, and ASA admin commands.
 */
export class RconClient {
  socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (body: string) => void; reject: (err: Error) => void }
  >();
  /** Source RCON is single-flight; overlapping sends corrupt reply matching. */
  private sendChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly password: string,
    private readonly timeoutMs = 5000,
    private readonly quiet = false,
  ) {}

  async connect(): Promise<void> {
    this.log(`[RconClient] Connecting to ${this.host}:${this.port}...`);
    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      const onError = (err: Error) => {
        socket.destroy();
        this.logError(`[RconClient] Connection error: ${err.message}`);
        reject(err);
      };
      socket.setTimeout(this.timeoutMs, () =>
        onError(new Error("RCON connection timeout")),
      );
      socket.once("error", onError);
      socket.connect(this.port, this.host, () => {
        socket.setTimeout(0);
        socket.removeListener("error", onError);
        this.socket = socket;
        this.log(`[RconClient] Connected to ${this.host}:${this.port}`);
        socket.on("data", (chunk) => this.onData(chunk));
        socket.on("error", (err) => this.failAll(err));
        socket.on("close", () =>
          this.failAll(new Error("RCON connection closed")),
        );
        resolve();
      });
    });

    this.log(`[RconClient] Authenticating...`);
    const authId = this.nextId++;
    const response = await this.sendPacket(authId, AUTH, this.password);
    if (response === null) {
      console.error(`[RconClient] Authentication rejected`);
      throw new Error("RCON authentication rejected (incorrect password)");
    }
    this.log(`[RconClient] Authenticated successfully`);
  }

  /** Sends a command and returns the server response (serialized). */
  async send(command: string): Promise<string> {
    if (this.socket === null) {
      throw new Error("RCON not connected");
    }

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.sendChain;
    this.sendChain = previous.then(
      () => gate,
      () => gate,
    );
    await previous.catch(() => undefined);

    try {
      if (this.socket === null) {
        throw new Error("RCON not connected");
      }
      this.log(`[RconClient] Sending command: "${command}"`);
      const id = this.nextId++;
      const body = await this.sendPacket(id, EXEC_COMMAND, command);
      const result = body ?? "";
      this.log(
        `[RconClient] Received response (${result.length} bytes): "${result.substring(0, 100)}${result.length > 100 ? "..." : ""}"`,
      );
      return result;
    } finally {
      release();
    }
  }

  private log(message: string): void {
    if (!this.quiet) {
      console.log(message);
    }
  }

  private logError(message: string): void {
    if (!this.quiet) {
      console.error(message);
    }
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
    this.failAll(new Error("RCON client closed"));
  }

  private sendPacket(
    id: number,
    type: number,
    body: string,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (this.socket === null) {
        reject(new Error("RCON not connected"));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // Drop the socket so late/orphaned replies cannot poison the next command.
        // Session manager reconnects on close.
        const socket = this.socket;
        this.socket = null;
        socket?.destroy();
        reject(new Error("Timeout waiting for RCON response"));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.socket.write(encodePacket(id, type, body));
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const packet = this.tryReadPacket();
      if (packet === null) break;
      this.dispatch(packet);
    }
  }

  private tryReadPacket(): Packet | null {
    if (this.buffer.length < 4) return null;
    const size = this.buffer.readInt32LE(0);
    if (this.buffer.length < 4 + size) return null;
    const id = this.buffer.readInt32LE(4);
    const type = this.buffer.readInt32LE(8);
    const body = this.buffer
      .subarray(12, 4 + size - 2)
      .toString("utf8");
    this.buffer = this.buffer.subarray(4 + size);
    return { id, type, body };
  }

  private dispatch(packet: Packet): void {
    if (packet.type === AUTH_RESPONSE) {
      if (packet.id === -1) {
        // Auth failed: reject all pending auth waiters.
        for (const [id, waiter] of this.pending) {
          waiter.resolve(null as unknown as string);
          this.pending.delete(id);
        }
        for (const waiter of this.pending.values()) {
          waiter.reject(new Error("RCON authentication failed"));
        }
        this.pending.clear();
        return;
      }
      const waiter = this.pending.get(packet.id);
      if (waiter !== undefined) {
        this.pending.delete(packet.id);
        waiter.resolve(packet.body);
      }
      return;
    }
    if (packet.type === RESPONSE_VALUE) {
      const waiter = this.pending.get(packet.id);
      if (waiter !== undefined) {
        this.pending.delete(packet.id);
        waiter.resolve(packet.body);
      }
    }
  }

  private failAll(err: Error): void {
    for (const waiter of this.pending.values()) {
      waiter.reject(err);
    }
    this.pending.clear();
    this.socket = null;
  }
}

/**
 * Runs a single RCON command opening and closing the connection.
 * Useful for one-shot operations (saveworld, broadcast, etc.).
 *
 * Pass `quiet: true` for readiness probes that expect ECONNREFUSED until
 * the dedicated is listening — avoids spamming the Electron console.
 */
export async function rconExec(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 5000,
  options?: { quiet?: boolean },
): Promise<string> {
  const quiet = options?.quiet === true;
  const client = new RconClient(host, port, password, timeoutMs, quiet);
  try {
    await client.connect();
    const result = await client.send(command);
    if (!quiet) {
      console.log(`[rconExec] Command successful`);
    }
    return result;
  } catch (err) {
    if (!quiet) {
      console.error(
        `[rconExec] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    throw err;
  } finally {
    client.close();
  }
}
