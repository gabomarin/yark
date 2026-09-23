import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupPublicIp } from "../../src/main/public-ip-service";

describe("lookupPublicIp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deduplicates concurrent lookups", async () => {
    let resolveFetch!: (response: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pendingFetch);
    vi.stubGlobal("fetch", fetchMock);

    const firstLookup = lookupPublicIp();
    const secondLookup = lookupPublicIp();
    resolveFetch(new Response(JSON.stringify({ ip: "203.0.113.10" }), { status: 200 }));

    await expect(firstLookup).resolves.toBe("203.0.113.10");
    await expect(secondLookup).resolves.toBe("203.0.113.10");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("hides raw network errors behind an operator-facing message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.ipify.org")));

    await expect(lookupPublicIp()).rejects.toThrow(
      "Could not detect the public IP. Check the network connection and try again.",
    );
  });
});
