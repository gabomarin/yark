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
  // dos bytes nulos finales ya están en cero por alloc
  return buf;
}

interface Packet {
  id: number;
  type: number;
  body: string;
}

/**
 * Cliente mínimo del protocolo Source RCON, suficiente para
 * saveworld, broadcast, kick/ban y comandos administrativos de ASA.
 */
export class RconClient {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (body: string) => void; reject: (err: Error) => void }
  >();

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly password: string,
    private readonly timeoutMs = 5000,
  ) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      const onError = (err: Error) => {
        socket.destroy();
        reject(err);
      };
      socket.setTimeout(this.timeoutMs, () =>
        onError(new Error("Timeout de conexión RCON")),
      );
      socket.once("error", onError);
      socket.connect(this.port, this.host, () => {
        socket.setTimeout(0);
        socket.removeListener("error", onError);
        this.socket = socket;
        socket.on("data", (chunk) => this.onData(chunk));
        socket.on("error", (err) => this.failAll(err));
        socket.on("close", () =>
          this.failAll(new Error("Conexión RCON cerrada")),
        );
        resolve();
      });
    });

    const authId = this.nextId++;
    const response = await this.sendPacket(authId, AUTH, this.password);
    if (response === null) {
      throw new Error("Autenticación RCON rechazada (password incorrecto)");
    }
  }

  /** Envía un comando y devuelve la respuesta del servidor. */
  async send(command: string): Promise<string> {
    if (this.socket === null) {
      throw new Error("RCON no conectado");
    }
    const id = this.nextId++;
    const body = await this.sendPacket(id, EXEC_COMMAND, command);
    return body ?? "";
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
    this.failAll(new Error("Cliente RCON cerrado"));
  }

  private sendPacket(
    id: number,
    type: number,
    body: string,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (this.socket === null) {
        reject(new Error("RCON no conectado"));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Timeout esperando respuesta RCON"));
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
        // Auth fallida: rechazar todas las esperas de auth.
        for (const [id, waiter] of this.pending) {
          waiter.resolve(null as unknown as string);
          this.pending.delete(id);
        }
        for (const waiter of this.pending.values()) {
          waiter.reject(new Error("Autenticación RCON fallida"));
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
 * Ejecuta un único comando RCON abriendo y cerrando conexión.
 * Útil para operaciones puntuales (saveworld, broadcast, etc.).
 */
export async function rconExec(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 5000,
): Promise<string> {
  const client = new RconClient(host, port, password, timeoutMs);
  try {
    await client.connect();
    return await client.send(command);
  } finally {
    client.close();
  }
}
