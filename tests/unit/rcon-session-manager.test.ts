import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RconSessionManager } from "@backend/infra/rcon/rcon-session-manager";

const rconMocks = vi.hoisted(() => ({
  send: vi.fn(),
  clients: [] as Array<{
    socket: EventEmitter;
    close: ReturnType<typeof vi.fn>;
    connectBarrier?: { resolve: () => void; promise: Promise<void> };
  }>,
  nextConnectDelay: false,
}));

vi.mock("@backend/infra/rcon/rcon-client", () => ({
  RconClient: class {
    socket = new EventEmitter();
    close = vi.fn();
    connectBarrier?: { resolve: () => void; promise: Promise<void> };

    constructor() {
      rconMocks.clients.push(this);
    }

    async connect(): Promise<void> {
      if (rconMocks.nextConnectDelay) {
        let resolveFn: () => void = () => undefined;
        const promise = new Promise<void>((resolve) => {
          resolveFn = resolve;
        });
        this.connectBarrier = { resolve: resolveFn, promise };
        await promise;
      }
    }

    send(command: string): Promise<string> {
      return rconMocks.send(command);
    }
  },
}));

describe("RconSessionManager", () => {
  beforeEach(() => {
    rconMocks.send.mockReset();
    rconMocks.clients.length = 0;
    rconMocks.nextConnectDelay = false;
  });

  it("normalizes ASA's generic no-content acknowledgement to an empty response", async () => {
    rconMocks.send.mockResolvedValue("Server received, But no response!! \n ");
    const manager = new RconSessionManager();

    await manager.connect("srv-1", "127.0.0.1", 27020, "admin");

    await expect(manager.send("srv-1", "DestroyWildDinos")).resolves.toBe("");
  });

  it("sends the exact trimmed command without rewriting Broadcast", async () => {
    rconMocks.send.mockResolvedValue("ok");
    const manager = new RconSessionManager();
    await manager.connect("srv-1", "127.0.0.1", 27020, "admin");

    await manager.send("srv-1", "  broadcast Hello World  ");

    expect(rconMocks.send).toHaveBeenCalledWith("broadcast Hello World");
  });

  it("ignores a delayed close event from a replaced client", async () => {
    const manager = new RconSessionManager();
    await manager.connect("srv-1", "127.0.0.1", 27020, "admin");
    const replacedClient = rconMocks.clients[0];

    manager.disconnect("srv-1");
    await manager.connect("srv-1", "127.0.0.1", 27020, "admin");
    replacedClient?.socket.emit("close");

    expect(manager.getStatus("srv-1").status).toBe("connected");
  });

  it("closes a late connect after disconnect so the socket is not orphaned", async () => {
    rconMocks.nextConnectDelay = true;
    const manager = new RconSessionManager();
    const connecting = manager.connect("srv-1", "127.0.0.1", 27020, "admin");
    const delayed = rconMocks.clients[0];
    expect(delayed?.connectBarrier).toBeDefined();

    manager.disconnect("srv-1");
    delayed?.connectBarrier?.resolve();
    await connecting;

    expect(delayed?.close).toHaveBeenCalled();
    expect(manager.getStatus("srv-1").status).toBe("disconnected");
  });

  it("supersedes a hung connecting attempt so reconnect is not skipped", async () => {
    rconMocks.nextConnectDelay = true;
    const manager = new RconSessionManager();
    const hung = manager.connect("srv-1", "127.0.0.1", 27020, "admin");
    const hungClient = rconMocks.clients[0];
    expect(manager.getStatus("srv-1").status).toBe("connecting");

    rconMocks.nextConnectDelay = false;
    await manager.connect("srv-1", "127.0.0.1", 27020, "admin");

    expect(manager.getStatus("srv-1").status).toBe("connected");
    hungClient?.connectBarrier?.resolve();
    await hung;
    expect(hungClient?.close).toHaveBeenCalled();
    expect(manager.getStatus("srv-1").status).toBe("connected");
  });

  it("queues concurrent sends so only one command runs at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    rconMocks.send.mockImplementation(async (command: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      return `ok:${command}`;
    });

    const manager = new RconSessionManager();
    await manager.connect("srv-1", "127.0.0.1", 27020, "admin");

    const [a, b, c] = await Promise.all([
      manager.send("srv-1", "ListPlayers"),
      manager.send("srv-1", "ListPlayers"),
      manager.send("srv-1", "SaveWorld"),
    ]);

    expect(maxInFlight).toBe(1);
    expect(a).toBe("ok:ListPlayers");
    expect(b).toBe("ok:ListPlayers");
    expect(c).toBe("ok:SaveWorld");
  });

  it("does not schedule reconnect when auto-reconnect is disabled", async () => {
    vi.useFakeTimers();
    const manager = new RconSessionManager();
    await manager.connect("srv-1", "127.0.0.1", 27020, "admin");
    const client = rconMocks.clients[0];
    const before = rconMocks.clients.length;

    manager.setAutoReconnect("srv-1", false);
    client?.socket.emit("close");
    await vi.advanceTimersByTimeAsync(30_000);

    expect(rconMocks.clients.length).toBe(before);
    expect(manager.getStatus("srv-1").status).toBe("disconnected");
    vi.useRealTimers();
  });
});
