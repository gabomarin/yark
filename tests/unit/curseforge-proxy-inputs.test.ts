import { describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../../workers/curseforge-proxy/src/index";

const env: Env = {
  CURSEFORGE_API_KEY: "test-key",
  ASA_GAME_ID: "83374",
  CORS_ALLOW_ORIGIN: "*",
};

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as {
    error?: { code?: string };
  };
  return body.error?.code ?? "";
}

describe("CurseForge proxy input bounds", () => {
  it("rejects oversized mod batches before calling CurseForge", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const request = new Request("https://proxy.test/v1/mods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modIds: Array.from({ length: 51 }, (_, index) => index + 1),
      }),
    });

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("too_many_mod_ids");
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockRestore();
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
      env,
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe(code);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockRestore();
  });

  it("rejects oversized search text before calling CurseForge", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const query = new URLSearchParams({ searchFilter: "x".repeat(201) });
    const response = await worker.fetch(
      new Request(`https://proxy.test/v1/mods/search?${query}`),
      env,
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_search_filter");
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockRestore();
  });
});
