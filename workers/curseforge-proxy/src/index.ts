/**
 * YARK CurseForge proxy — keeps the Overwolf API key off the Electron client.
 *
 * Upstream: https://api.curseforge.com
 * Auth header: x-api-key
 */

export interface Env {
  CURSEFORGE_API_KEY: string;
  ASA_GAME_ID: string;
}

const UPSTREAM = "https://api.curseforge.com";
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "yark-curseforge-proxy" });
      }

      const apiKey = (env.CURSEFORGE_API_KEY ?? "").trim();
      if (apiKey.length === 0) {
        return json(
          {
            error:
              "CURSEFORGE_API_KEY is not configured. Run: npx wrangler secret put CURSEFORGE_API_KEY",
          },
          503,
        );
      }

      const gameId = (env.ASA_GAME_ID || "83374").trim();

      if (request.method === "GET" && url.pathname === "/v1/mods/search") {
        return proxySearch(url, apiKey, gameId);
      }

      const modMatch = /^\/v1\/mods\/(\d+)$/.exec(url.pathname);
      if (request.method === "GET" && modMatch !== null) {
        return proxyGetMod(modMatch[1], apiKey);
      }

      if (request.method === "POST" && url.pathname === "/v1/mods") {
        return proxyGetMods(request, apiKey);
      }

      return json({ error: "Not found" }, 404);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Proxy error";
      return json({ error: message }, 502);
    }
  },
};

async function proxyGetMod(modId: string, apiKey: string): Promise<Response> {
  return forward(
    `${UPSTREAM}/v1/mods/${modId}`,
    { method: "GET", headers: upstreamHeaders(apiKey) },
  );
}

async function proxyGetMods(request: Request, apiKey: string): Promise<Response> {
  const body = await request.text();
  return forward(`${UPSTREAM}/v1/mods`, {
    method: "POST",
    headers: {
      ...upstreamHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: body.length > 0 ? body : JSON.stringify({ modIds: [] }),
  });
}

async function proxySearch(
  clientUrl: URL,
  apiKey: string,
  gameId: string,
): Promise<Response> {
  const upstream = new URL(`${UPSTREAM}/v1/mods/search`);
  upstream.searchParams.set("gameId", gameId);
  for (const key of [
    "searchFilter",
    "classId",
    "categoryId",
    "slug",
    "sortField",
    "sortOrder",
    "index",
    "pageSize",
  ]) {
    const value = clientUrl.searchParams.get(key);
    if (value !== null && value.length > 0) {
      upstream.searchParams.set(key, value);
    }
  }
  return forward(upstream.toString(), {
    method: "GET",
    headers: upstreamHeaders(apiKey),
  });
}

function upstreamHeaders(apiKey: string): HeadersInit {
  return {
    Accept: "application/json",
    "x-api-key": apiKey,
  };
}

async function forward(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  const text = await response.text();
  const headers = new Headers(CORS_HEADERS);
  headers.set(
    "Content-Type",
    response.headers.get("Content-Type") ?? "application/json",
  );
  return new Response(text, { status: response.status, headers });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}
