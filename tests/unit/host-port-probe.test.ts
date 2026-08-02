import { createServer, type AddressInfo } from "node:net";
import { createSocket } from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";
import {
  encodeSuggestedSessionPorts,
  formatHostPortBusyError,
  formatHostPortInconclusiveError,
  humanizeHostPortProbeError,
  isHostPortBusyError,
  isHostPortProbeError,
  isInconclusiveHostPortProbeError,
  parseSuggestedSessionPorts,
} from "@shared/host-port-probe-errors";
import {
  assertHostPortsAvailable,
  collectReservedPorts,
  parseOwnerLookupJson,
  suggestSessionPortSet,
  type HostPortProbeDeps,
  type ProbeStatus,
} from "@backend/infra/process/host-port-probe";

function depsFromMap(map: Record<string, ProbeStatus>): HostPortProbeDeps {
  return {
    bindUdp: async (port) => map[`udp:${port}`] ?? "free",
    bindTcp: async (port) => map[`tcp:${port}`] ?? "free",
    lookupOwner: async () => null,
  };
}

describe("host-port-probe-errors", () => {
  it("encodes and parses suggested session ports", () => {
    const ports = { gamePort: 7787, queryPort: 27025, rconPort: 27030 };
    const encoded = encodeSuggestedSessionPorts(ports);
    expect(encoded).toBe("suggested=game:7787,query:27025,rcon:27030");
    expect(
      parseSuggestedSessionPorts(
        formatHostPortBusyError("UDP game port 7777 is already in use.", ports),
      ),
    ).toEqual(ports);
  });

  it("rejects invalid suggested trailers", () => {
    expect(
      parseSuggestedSessionPorts(
        "HOST_PORT_BUSY: nope suggested=game:1,query:2,rcon:3",
      ),
    ).toBeNull();
    expect(
      parseSuggestedSessionPorts(
        "HOST_PORT_BUSY: nope suggested=game:7777,query:7777,rcon:27020",
      ),
    ).toBeNull();
  });

  it("classifies prefixes and humanizes messages", () => {
    const busy = formatHostPortBusyError("UDP game port 7777 is already in use.", {
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    });
    expect(isHostPortBusyError(busy)).toBe(true);
    expect(isInconclusiveHostPortProbeError(busy)).toBe(false);
    expect(isHostPortProbeError(busy)).toBe(true);
    expect(humanizeHostPortProbeError(busy)).toBe(
      "UDP game port 7777 is already in use.",
    );

    const inconclusive = formatHostPortInconclusiveError(
      "Could not confirm whether UDP game port 7777 is free.",
    );
    expect(isInconclusiveHostPortProbeError(inconclusive)).toBe(true);
    expect(isHostPortProbeError(inconclusive)).toBe(true);
  });
});

describe("parseOwnerLookupJson", () => {
  it("parses ConvertTo-Json owner rows", () => {
    expect(
      parseOwnerLookupJson(
        '{"OwningProcess":4242,"ProcessName":"ArkAscendedServer"}',
      ),
    ).toEqual({ pid: 4242, processName: "ArkAscendedServer" });
    expect(parseOwnerLookupJson('{"OwningProcess":99,"ProcessName":null}')).toEqual({
      pid: 99,
      processName: null,
    });
    expect(parseOwnerLookupJson("")).toBeNull();
    expect(parseOwnerLookupJson("not-json")).toBeNull();
    expect(parseOwnerLookupJson('{"OwningProcess":0}')).toBeNull();
  });
});

describe("host-port-probe", () => {
  it("passes when all endpoints are free", async () => {
    await expect(
      assertHostPortsAvailable(
        {
          id: "a",
          name: "A",
          gamePort: 7777,
          queryPort: 27015,
          rconPort: 27020,
        },
        [],
        { deps: depsFromMap({}) },
      ),
    ).resolves.toBeUndefined();
  });

  it("throws HOST_PORT_BUSY with a suggested free set", async () => {
    const deps = depsFromMap({
      "udp:7777": "busy",
    });
    deps.lookupOwner = async () => ({
      pid: 4242,
      processName: "ArkAscendedServer",
    });

    await expect(
      assertHostPortsAvailable(
        {
          id: "a",
          name: "A",
          gamePort: 7777,
          queryPort: 27015,
          rconPort: 27020,
        },
        [],
        { deps },
      ),
    ).rejects.toThrow(/HOST_PORT_BUSY:.*pid 4242 \(ArkAscendedServer\).*suggested=game:7787/);
  });

  it("throws HOST_PORT_PROBE_INCONCLUSIVE without claiming occupied", async () => {
    await expect(
      assertHostPortsAvailable(
        {
          id: "a",
          name: "A",
          gamePort: 7777,
          queryPort: 27015,
          rconPort: 27020,
        },
        [],
        { deps: depsFromMap({ "udp:7777": "inconclusive" }) },
      ),
    ).rejects.toThrow(/^HOST_PORT_PROBE_INCONCLUSIVE:/);
  });

  it("allows inconclusive when allowInconclusive is set", async () => {
    await expect(
      assertHostPortsAvailable(
        {
          id: "a",
          name: "A",
          gamePort: 7777,
          queryPort: 27015,
          rconPort: 27020,
        },
        [],
        {
          allowInconclusive: true,
          deps: depsFromMap({ "udp:7777": "inconclusive" }),
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("still blocks busy when allowInconclusive is set", async () => {
    await expect(
      assertHostPortsAvailable(
        {
          id: "a",
          name: "A",
          gamePort: 7777,
          queryPort: 27015,
          rconPort: 27020,
        },
        [],
        {
          allowInconclusive: true,
          deps: depsFromMap({ "udp:7777": "busy" }),
        },
      ),
    ).rejects.toThrow(/^HOST_PORT_BUSY:/);
  });

  it("suggests a free set skipping reserved YARK ports", async () => {
    const reserved = collectReservedPorts([
      { gamePort: 7777, queryPort: 27015, rconPort: 27020 },
      { gamePort: 7787, queryPort: 27025, rconPort: 27030 },
    ]);
    const suggested = await suggestSessionPortSet(
      { gamePort: 7777, queryPort: 27015, rconPort: 27020 },
      reserved,
      depsFromMap({}),
    );
    expect(suggested).toEqual({
      gamePort: 7797,
      queryPort: 27035,
      rconPort: 27040,
    });
  });

  it("never suggests a set that did not bind-confirm free", async () => {
    const deps: HostPortProbeDeps = {
      bindUdp: async (port) => (port === 7787 ? "busy" : "free"),
      bindTcp: async () => "free",
      lookupOwner: async () => null,
    };
    const suggested = await suggestSessionPortSet(
      { gamePort: 7777, queryPort: 27015, rconPort: 27020 },
      new Set([7777, 27015, 27020]),
      deps,
    );
    expect(suggested).toEqual({
      gamePort: 7797,
      queryPort: 27035,
      rconPort: 27040,
    });
  });

  it("returns null when no free set can be confirmed", async () => {
    const deps = depsFromMap({});
    deps.bindUdp = async () => "busy";
    deps.bindTcp = async () => "busy";
    await expect(
      suggestSessionPortSet(
        { gamePort: 7777, queryPort: 27015, rconPort: 27020 },
        new Set(),
        deps,
      ),
    ).resolves.toBeNull();
  });
});

describe("host-port-probe owner enrichment", () => {
  it("keeps busy status when owner lookup fails", async () => {
    const deps = depsFromMap({ "tcp:27020": "busy" });
    deps.lookupOwner = async () => null;
    await expect(
      assertHostPortsAvailable(
        {
          id: "a",
          name: "A",
          gamePort: 7777,
          queryPort: 27015,
          rconPort: 27020,
        },
        [],
        { deps },
      ),
    ).rejects.toThrow(/HOST_PORT_BUSY:.*TCP rcon port 27020 is already in use/);
  });
});

describe("host-port-probe real TCP bind", () => {
  const holders: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      holders.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  });

  it("classifies a real listening TCP port as busy", async () => {
    const holder = createServer();
    holders.push(holder);
    await new Promise<void>((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(0, "0.0.0.0", () => resolve());
    });
    const port = (holder.address() as AddressInfo).port;

    await expect(
      assertHostPortsAvailable(
        {
          id: "a",
          name: "A",
          gamePort: 41111,
          queryPort: 41112,
          rconPort: port,
        },
        [],
        {
          deps: {
            bindUdp: async () => "free",
            lookupOwner: async () => null,
          },
        },
      ),
    ).rejects.toThrow(/HOST_PORT_BUSY:.*TCP rcon port/);
  });
});

describe("host-port-probe real UDP release", () => {
  async function allocateUdpPort(): Promise<number> {
    const socket = createSocket("udp4");
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("error", reject);
        socket.bind({ port: 0, exclusive: true }, () => resolve());
      });
      const address = socket.address();
      return typeof address === "string" ? 0 : address.port;
    } finally {
      await new Promise<void>((resolve) => {
        socket.close(() => resolve());
      });
    }
  }

  it("releases the UDP probe socket before resolving free", async () => {
    const gamePort = await allocateUdpPort();
    const queryPort = await allocateUdpPort();
    expect(gamePort).toBeGreaterThan(0);
    expect(queryPort).toBeGreaterThan(0);
    expect(gamePort).not.toBe(queryPort);

    const ports = {
      id: "a",
      name: "A",
      gamePort,
      queryPort,
      rconPort: Math.max(gamePort, queryPort) + 1,
    };

    await assertHostPortsAvailable(ports, [], {
      deps: {
        bindTcp: async () => "free",
        lookupOwner: async () => null,
      },
    });

    // Immediate re-probe must succeed; resolving before close would flake as busy.
    await expect(
      assertHostPortsAvailable(ports, [], {
        deps: {
          bindTcp: async () => "free",
          lookupOwner: async () => null,
        },
      }),
    ).resolves.toBeUndefined();

    const verify = createSocket("udp4");
    try {
      await new Promise<void>((resolve, reject) => {
        verify.once("error", reject);
        verify.bind({ port: gamePort, exclusive: true }, () => resolve());
      });
    } finally {
      await new Promise<void>((resolve) => {
        verify.close(() => resolve());
      });
    }
  });
});
