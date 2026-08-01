/**
 * YARK CurseForge proxy — keeps the Overwolf API key off the Electron client.
 *
 * Returns a normalized YARK envelope suitable for caching / UI.
 * Never echoes the API key (or upstream auth headers) to clients.
 */

import { resolveWorkerConfig, type Env } from "./config";

export type { Env };

/** Cached / UI-facing mod row (aligned with Electron `ModMetadata`). */
export interface YarkModMetadata {
  id: string;
  name: string;
  summary: string;
  thumbnailUrl: string | null;
  authors: string[];
  downloadCount: number;
  dateModified: string;
  curseforgeUrl: string;
  slug: string;
  categories: string[];
}

export interface YarkApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type YarkApiSuccess<T> = {
  ok: true;
  data: T;
};

/** Fixed upstream contract — not a secret; not expected to change often. */
const UPSTREAM = "https://api.curseforge.com";

type CorsHeaders = Record<string, string>;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const config = resolveWorkerConfig(env);
    if ("error" in config) {
      return errorJson(
        {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept",
        },
        503,
        "misconfigured",
        config.error,
      );
    }

    const { asaGameId, corsHeaders } = config;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return okJson(corsHeaders, { service: "yark-curseforge-proxy" });
      }

      const apiKey = (env.CURSEFORGE_API_KEY ?? "").trim();
      if (apiKey.length === 0) {
        return errorJson(
          corsHeaders,
          503,
          "missing_api_key",
          "CurseForge proxy is not configured. Set the Worker secret in Cloudflare.",
        );
      }

      if (request.method === "GET" && url.pathname === "/v1/mods/search") {
        return handleSearch(url, apiKey, asaGameId, corsHeaders);
      }

      const modMatch = /^\/v1\/mods\/(\d+)$/.exec(url.pathname);
      if (request.method === "GET" && modMatch !== null) {
        return handleGetMod(modMatch[1], apiKey, asaGameId, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/v1/mods") {
        return handleGetMods(request, apiKey, asaGameId, corsHeaders);
      }

      return errorJson(corsHeaders, 404, "not_found", "Unknown route.");
    } catch (cause) {
      return errorJson(corsHeaders, 502, "proxy_error", sanitizeErrorMessage(cause));
    }
  },
};

async function handleGetMod(
  modId: string,
  apiKey: string,
  asaGameId: number,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  const upstream = await fetchUpstream(
    `${UPSTREAM}/v1/mods/${modId}`,
    { method: "GET", headers: upstreamHeaders(apiKey) },
  );
  if (!upstream.ok) {
    return mapUpstreamError(corsHeaders, upstream.status, upstream.bodyText);
  }

  const rawMod = extractSingleMod(upstream.json);
  if (rawMod === null) {
    return errorJson(
      corsHeaders,
      502,
      "invalid_upstream",
      "CurseForge returned an unexpected mod payload.",
    );
  }
  if (!isAsaMod(rawMod, asaGameId)) {
    return errorJson(
      corsHeaders,
      404,
      "not_asa_mod",
      `Project ${modId} is not an Ark: Survival Ascended CurseForge mod.`,
    );
  }

  return okJson(corsHeaders, toYarkMod(rawMod));
}

async function handleGetMods(
  request: Request,
  apiKey: string,
  asaGameId: number,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  let modIds: number[];
  try {
    const parsed = (await request.json()) as { modIds?: unknown };
    if (!Array.isArray(parsed.modIds)) {
      return errorJson(
        corsHeaders,
        400,
        "invalid_body",
        'Body must be { "modIds": number[] }.',
      );
    }
    modIds = [];
    const seenModIds = new Set<number>();
    for (const value of parsed.modIds) {
      const id = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isInteger(id) || id <= 0) {
        return errorJson(
          corsHeaders,
          400,
          "invalid_mod_id",
          "Each modId must be a positive integer.",
        );
      }
      if (seenModIds.has(id)) continue;
      seenModIds.add(id);
      modIds.push(id);
    }
  } catch {
    return errorJson(
      corsHeaders,
      400,
      "invalid_body",
      'Body must be JSON { "modIds": number[] }.',
    );
  }

  if (modIds.length === 0) {
    return okJson(corsHeaders, {
      items: [] as YarkModMetadata[],
      skipped: [] as Array<{ id: string; reason: string }>,
    });
  }

  const upstream = await fetchUpstream(`${UPSTREAM}/v1/mods`, {
    method: "POST",
    headers: {
      ...upstreamHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ modIds }),
  });
  if (!upstream.ok) {
    return mapUpstreamError(corsHeaders, upstream.status, upstream.bodyText);
  }

  const rawMods = extractModList(upstream.json);
  const byId = new Map<number, Record<string, unknown>>();
  for (const mod of rawMods) {
    const id = Number(mod["id"]);
    if (Number.isFinite(id)) byId.set(id, mod);
  }

  const items: YarkModMetadata[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const id of modIds) {
    const raw = byId.get(id);
    if (raw === undefined) {
      skipped.push({ id: String(id), reason: "not_found" });
      continue;
    }
    if (!isAsaMod(raw, asaGameId)) {
      skipped.push({ id: String(id), reason: "not_asa_mod" });
      continue;
    }
    items.push(toYarkMod(raw));
  }

  return okJson(corsHeaders, { items, skipped });
}

async function handleSearch(
  clientUrl: URL,
  apiKey: string,
  asaGameId: number,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  const upstreamUrl = new URL(`${UPSTREAM}/v1/mods/search`);
  upstreamUrl.searchParams.set("gameId", String(asaGameId));
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
      upstreamUrl.searchParams.set(key, value);
    }
  }

  const upstream = await fetchUpstream(upstreamUrl.toString(), {
    method: "GET",
    headers: upstreamHeaders(apiKey),
  });
  if (!upstream.ok) {
    return mapUpstreamError(corsHeaders, upstream.status, upstream.bodyText);
  }

  const rawMods = extractModList(upstream.json);
  const items: YarkModMetadata[] = [];
  for (const mod of rawMods) {
    if (isAsaMod(mod, asaGameId)) {
      items.push(toYarkMod(mod));
    }
  }

  const pagination = extractPagination(upstream.json);
  return okJson(corsHeaders, {
    items,
    pagination,
  });
}

function toYarkMod(mod: Record<string, unknown>): YarkModMetadata {
  const id = String(mod["id"] ?? "");
  const slug = String(mod["slug"] ?? id);
  const links = asRecord(mod["links"]);
  const logo = asRecord(mod["logo"]);
  const authorsRaw = Array.isArray(mod["authors"]) ? mod["authors"] : [];
  const categoriesRaw = Array.isArray(mod["categories"]) ? mod["categories"] : [];

  const authors = authorsRaw
    .map((entry) => {
      const row = asRecord(entry);
      return typeof row?.["name"] === "string" ? row["name"] : null;
    })
    .filter((name): name is string => name !== null && name.length > 0);

  const categories = categoriesRaw
    .map((entry) => {
      const row = asRecord(entry);
      return typeof row?.["name"] === "string" ? row["name"] : null;
    })
    .filter((name): name is string => name !== null && name.length > 0);

  const websiteUrl =
    typeof links?.["websiteUrl"] === "string" && links["websiteUrl"].length > 0
      ? links["websiteUrl"]
      : `https://www.curseforge.com/ark-survival-ascended/mods/${slug}`;

  const thumbnail =
    typeof logo?.["thumbnailUrl"] === "string" && logo["thumbnailUrl"].length > 0
      ? logo["thumbnailUrl"]
      : typeof logo?.["url"] === "string" && logo["url"].length > 0
        ? logo["url"]
        : null;

  const dateModified =
    typeof mod["dateModified"] === "string" && mod["dateModified"].length > 0
      ? mod["dateModified"]
      : typeof mod["dateReleased"] === "string"
        ? mod["dateReleased"]
        : new Date(0).toISOString();

  return {
    id,
    name: typeof mod["name"] === "string" ? mod["name"] : `Mod ${id}`,
    summary: typeof mod["summary"] === "string" ? mod["summary"] : "",
    thumbnailUrl: thumbnail,
    authors,
    downloadCount:
      typeof mod["downloadCount"] === "number" && Number.isFinite(mod["downloadCount"])
        ? mod["downloadCount"]
        : 0,
    dateModified,
    curseforgeUrl: websiteUrl,
    slug,
    categories,
  };
}

function isAsaMod(mod: Record<string, unknown>, asaGameId: number): boolean {
  const gameId = Number(mod["gameId"]);
  return Number.isFinite(gameId) && gameId === asaGameId;
}

function extractSingleMod(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (root === null) return null;
  return asRecord(root["data"]);
}

function extractModList(payload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(payload);
  if (root === null) return [];
  const data = root["data"];
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function extractPagination(payload: unknown): {
  index: number;
  pageSize: number;
  resultCount: number;
  totalCount: number;
} {
  const root = asRecord(payload);
  const pagination = asRecord(root?.["pagination"]);
  return {
    index: numberOr(pagination?.["index"], 0),
    pageSize: numberOr(pagination?.["pageSize"], 0),
    resultCount: numberOr(pagination?.["resultCount"], 0),
    totalCount: numberOr(pagination?.["totalCount"], 0),
  };
}

async function fetchUpstream(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; bodyText: string; json: unknown }> {
  const response = await fetch(url, init);
  const bodyText = await response.text();
  let json: unknown = null;
  try {
    json = bodyText.length > 0 ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    bodyText,
    json,
  };
}

function mapUpstreamError(
  corsHeaders: CorsHeaders,
  status: number,
  bodyText: string,
): Response {
  void bodyText;
  if (status === 401 || status === 403) {
    return errorJson(
      corsHeaders,
      502,
      "upstream_auth",
      "CurseForge rejected the proxy credentials. Check the Worker secret in Cloudflare.",
    );
  }
  if (status === 404) {
    return errorJson(corsHeaders, 404, "not_found", "Mod not found on CurseForge.");
  }
  if (status === 429) {
    return errorJson(
      corsHeaders,
      429,
      "rate_limited",
      "CurseForge rate limit reached. Try again in a moment.",
    );
  }
  if (status >= 500) {
    return errorJson(
      corsHeaders,
      502,
      "upstream_unavailable",
      "CurseForge is temporarily unavailable.",
    );
  }
  return errorJson(
    corsHeaders,
    status >= 400 && status < 600 ? status : 502,
    "upstream_error",
    `CurseForge request failed (${status}).`,
  );
}

function upstreamHeaders(apiKey: string): HeadersInit {
  return {
    Accept: "application/json",
    "x-api-key": apiKey,
  };
}

function okJson<T>(corsHeaders: CorsHeaders, data: T, status = 200): Response {
  const body: YarkApiSuccess<T> = { ok: true, data };
  return Response.json(body, { status, headers: corsHeaders });
}

function errorJson(
  corsHeaders: CorsHeaders,
  status: number,
  code: string,
  message: string,
): Response {
  const body: YarkApiErrorBody = {
    ok: false,
    error: {
      code,
      message: redactSecrets(message),
    },
  };
  return Response.json(body, { status, headers: corsHeaders });
}

function sanitizeErrorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return redactSecrets(cause.message) || "Proxy error";
  }
  return "Proxy error";
}

function redactSecrets(value: string): string {
  return value
    .replace(/x-api-key\s*[:=]\s*\S+/gi, "x-api-key=[redacted]")
    .replace(/api[_-]?key\s*[:=]\s*\S+/gi, "api_key=[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
