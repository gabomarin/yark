import { afterEach, describe, expect, it, vi } from "vitest";
import worker, {
  MAX_POST_BODY_BYTES,
  type Env,
} from "../../workers/curseforge-proxy/src/index";
import type { RateLimiter } from "../../workers/curseforge-proxy/src/config";

function allowLimiter(): RateLimiter {
  return { limit: async () => ({ success: true }) };
}

function denyLimiter(): RateLimiter {
  return { limit: async () => ({ success: false }) };
}

const baseEnv: Env = {
  CURSEFORGE_API_KEY: "test-key",
  ASA_GAME_ID: "83374",
  CORS_ALLOW_ORIGIN: "*",
  RATE_LIMIT_SEARCH: allowLimiter(),
  RATE_LIMIT_READ: allowLimiter(),
  RATE_LIMIT_BATCH: allowLimiter(),
};

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as {
    error?: { code?: string };
  };
  return body.error?.code ?? "";
}

function asaModPayload(id: number): Record<string, unknown> {
  return {
    id,
    gameId: 83374,
    name: `Mod ${id}`,
    summary: "summary",
    slug: `mod-${id}`,
    authors: [],
    categories: [],
    downloadCount: 1,
    dateModified: "2026-01-01T00:00:00Z",
    links: {
      websiteUrl: `https://www.curseforge.com/ark-survival-ascended/mods/mod-${id}`,
    },
    logo: {},
  };
}

describe("CurseForge proxy input bounds", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "caches");
  });

  it("rejects oversized mod batches before calling CurseForge", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const request = new Request("https://proxy.test/v1/mods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modIds: Array.from({ length: 51 }, (_, index) => index + 1),
      }),
    });

    const response = await worker.fetch(request, baseEnv);

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("too_many_mod_ids");
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["pageSize=0", "invalid_page_size"],
    ["pageSize=51", "invalid_page_size"],
    ["pageSize=abc", "invalid_page_size"],
    ["index=-1", "invalid_index"],
    ["index=1.5", "invalid_index"],
  ])("rejects invalid search pagination (%s)", async (query, code) => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(
      new Request(`https://proxy.test/v1/mods/search?${query}`),
      baseEnv,
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe(code);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects oversized search text before calling CurseForge", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const query = new URLSearchParams({ searchFilter: "x".repeat(201) });
    const response = await worker.fetch(
      new Request(`https://proxy.test/v1/mods/search?${query}`),
      baseEnv,
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_search_filter");
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("CurseForge proxy abuse controls (#70)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "caches");
  });

  it("rejects oversized POST bodies before calling CurseForge", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const body = JSON.stringify({
      modIds: [1],
      pad: "x".repeat(MAX_POST_BODY_BYTES),
    });
    expect(body.length).toBeGreaterThan(MAX_POST_BODY_BYTES);

    const response = await worker.fetch(
      new Request("https://proxy.test/v1/mods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      baseEnv,
    );

    expect(response.status).toBe(413);
    expect(await errorCode(response)).toBe("body_too_large");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("maps upstream abort to upstream_timeout without leaking secrets", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new Error("The operation was aborted."), {
        name: "AbortError",
      }),
    );

    const response = await worker.fetch(
      new Request("https://proxy.test/v1/mods/12345"),
      baseEnv,
    );

    expect(response.status).toBe(504);
    expect(await errorCode(response)).toBe("upstream_timeout");
    expect(upstream).toHaveBeenCalled();
  });

  it("returns 429 when the route rate limiter denies", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const env: Env = {
      ...baseEnv,
      RATE_LIMIT_SEARCH: denyLimiter(),
    };

    const response = await worker.fetch(
      new Request("https://proxy.test/v1/mods/search?pageSize=10"),
      env,
    );

    expect(response.status).toBe(429);
    expect(await errorCode(response)).toBe("rate_limited");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns 405 for wrong methods on known routes", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");

    const searchPost = await worker.fetch(
      new Request("https://proxy.test/v1/mods/search", { method: "POST" }),
      baseEnv,
    );
    expect(searchPost.status).toBe(405);
    expect(searchPost.headers.get("Allow")).toBe("GET");
    expect(await errorCode(searchPost)).toBe("method_not_allowed");

    const batchGet = await worker.fetch(
      new Request("https://proxy.test/v1/mods", { method: "GET" }),
      baseEnv,
    );
    expect(batchGet.status).toBe(405);
    expect(batchGet.headers.get("Allow")).toBe("POST");

    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves a cache HIT on the second GET mod without a second upstream call", async () => {
    const store = new Map<string, Response>();
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        default: {
          match: async (request: Request) => store.get(request.url) ?? undefined,
          put: async (request: Request, response: Response) => {
            store.set(
              request.url,
              new Response(await response.arrayBuffer(), {
                status: response.status,
                headers: response.headers,
              }),
            );
          },
        },
      },
    });

    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: asaModPayload(99) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const first = await worker.fetch(
      new Request("https://proxy.test/v1/mods/99"),
      baseEnv,
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Yark-Cache")).toBe("MISS");
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(upstream).toHaveBeenCalledTimes(1);

    const second = await worker.fetch(
      new Request("https://proxy.test/v1/mods/99"),
      baseEnv,
    );
    expect(second.status).toBe(200);
    expect(second.headers.get("X-Yark-Cache")).toBe("HIT");
    expect(second.headers.get("Cache-Control")).toBe("no-store");
    expect(upstream).toHaveBeenCalledTimes(1);

    const body = (await second.json()) as {
      ok: boolean;
      data: { id: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("99");
  });

  it("ignores junk search query params when keying the edge cache", async () => {
    const store = new Map<string, Response>();
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        default: {
          match: async (request: Request) => store.get(request.url) ?? undefined,
          put: async (request: Request, response: Response) => {
            store.set(
              request.url,
              new Response(await response.arrayBuffer(), {
                status: response.status,
                headers: response.headers,
              }),
            );
          },
        },
      },
    });

    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [asaModPayload(7)],
          pagination: {
            index: 0,
            pageSize: 10,
            resultCount: 1,
            totalCount: 1,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const first = await worker.fetch(
      new Request("https://proxy.test/v1/mods/search?pageSize=10&noise=1"),
      baseEnv,
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Yark-Cache")).toBe("MISS");
    expect(upstream).toHaveBeenCalledTimes(1);

    const second = await worker.fetch(
      new Request("https://proxy.test/v1/mods/search?pageSize=10&noise=different"),
      baseEnv,
    );
    expect(second.status).toBe(200);
    expect(second.headers.get("X-Yark-Cache")).toBe("HIT");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("proxies ASA categories and strips unknown query noise (#297)", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 12_345,
              gameId: 83_374,
              name: "Mods",
              slug: "mods",
              isClass: true,
              classId: null,
              parentCategoryId: null,
              displayIndex: 0,
            },
            {
              id: 99,
              gameId: 432,
              name: "Other game",
              slug: "other",
              isClass: true,
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const response = await worker.fetch(
      new Request("https://proxy.test/v1/categories?classesOnly=true&noise=1"),
      baseEnv,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { categories: Array<{ id: number; name: string }> };
    };
    expect(body.ok).toBe(true);
    expect(body.data.categories).toEqual([
      expect.objectContaining({ id: 12_345, name: "Mods" }),
    ]);
    const upstreamUrl = String(upstream.mock.calls[0]?.[0]);
    expect(upstreamUrl).toContain("gameId=83374");
    expect(upstreamUrl).toContain("classesOnly=true");
    expect(upstreamUrl).not.toContain("noise=");
  });
});
