import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RconSessionManager } from "@backend/infra/rcon/rcon-session-manager";

const rconMocks = vi.hoisted(() => ({
  send: vi.fn(),
  clients: [] as Array<{ socket: EventEmitter }>,
}));

vi.mock("@backend/infra/rcon/rcon-client", () => ({
  RconClient: class {
    socket = new EventEmitter();

    constructor() {
      rconMocks.clients.push(this);
    }

    async connect(): Promise<void> {}

    send(command: string): Promise<string> {
      return rconMocks.send(command);
    }

    close(): void {}
  },
}));

describe("RconSessionManager", () => {
  beforeEach(() => {
    rconMocks.send.mockReset();
    rconMocks.clients.length = 0;
  });

  it("normalizes ASA's generic no-content acknowledgement to an empty response", async () => {
    rconMocks.send.mockResolvedValue("Server received, But no response!! \n ");
    const manager = new RconSessionManager();

    await manager.connect("srv-1", "127.0.0.1", 27020, "admin");

    await expect(manager.send("srv-1", "DestroyWildDinos")).resolves.toBe("");
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
});
