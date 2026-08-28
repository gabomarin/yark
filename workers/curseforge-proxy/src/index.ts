/**
 * YARK CurseForge proxy — keeps the Overwolf API key off the Electron client.
 *
 * Returns a normalized YARK envelope suitable for caching / UI.
 * Never echoes the API key (or upstream auth headers) to clients.
 *
 * Abuse controls (#70): route-class IP rate limits, body/time bounds,
 * Cache API for safe GETs, privacy-conscious structured logs.
 */

import { resolveWorkerConfig, type Env, type RateLimiter } from "./config";

export type { Env };

/** Cached / UI-facing mod row (aligned with Electron `ModMetadata`). */
export interface YarkModMetadata {
  id: string;
  name: string;
  summary: string;
  /**
   * Plain-text description (truncated). Fetched on GET /v1/mods/:id for all
   * mods (#342); Maps-only on POST batch (#195); null on search rows.
   */
  description: string | null;
  thumbnailUrl: string | null;
  /** Capped HTTPS screenshot URLs from Get Mod (no blobs) (#342). */
  screenshots: string[];
  authors: string[];
  downloadCount: number;
  dateModified: string;
  curseforgeUrl: string;
  slug: string;
  categories: string[];
}

/** Bound SQLite / IPC cache size for author description text. */
const MAX_DESCRIPTION_CHARS = 8_000;
/** Cap screenshot URLs forwarded from CurseForge Get Mod (#342). */
const MAX_SCREENSHOT_URLS = 8;

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
const UPSTREAM_HOST = "api.curseforge.com";
const MAX_UPSTREAM_REDIRECTS = 3;
const MAX_BATCH_MOD_IDS = 50;
const MAX_SEARCH_FILTER_LENGTH = 200;
const MAX_SEARCH_PAGE_SIZE = 50;
/** POST /v1/mods body cap (50 mod IDs is far smaller). */
export const MAX_POST_BODY_BYTES = 16 * 1024;
/** Bounded upstream execution time per hop chain. */
export const UPSTREAM_TIMEOUT_MS = 10_000;
/** Edge cache TTL for GET /v1/mods/:id. */
const CACHE_TTL_READ_SECONDS = 600;
/** Edge cache TTL for GET /v1/mods/search. */
const CACHE_TTL_SEARCH_SECONDS = 60;
/** Edge cache TTL for GET /v1/categories (classes/categories change rarely). */
const CACHE_TTL_CATEGORIES_SECONDS = 21_600;
/** Synthetic origin for Cache API keys (stable across workers.dev hostnames). */
const CACHE_KEY_ORIGIN = "https://yark-curseforge-proxy.cache";
/** Query params forwarded upstream and used for search cache keys (single-valued). */
const SEARCH_FORWARD_PARAMS = [
  "searchFilter",
  "classId",
  "categoryId",
  "slug",
  "sortField",
  "sortOrder",
  "index",
  "pageSize",
] as const;

type CorsHeaders = Record<string, string>;
type RouteClass = "health" | "search" | "read" | "batch" | "unknown";
type CacheOutcome = "HIT" | "MISS" | "BYPASS";

interface RequestMetrics {
  routeClass: RouteClass;
  method: string;
  cache: CacheOutcome;
  upstreamStatus: number | null;
  rateLimited: boolean;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    const metrics: RequestMetrics = {
      routeClass: "unknown",
      method: request.method,
      cache: "BYPASS",
      upstreamStatus: null,
      rateLimited: false,
    };

    const respond = (response: Response): Response => {
      logRequest(metrics, response.status, Date.now() - started);
      return response;
    };

    const config = resolveWorkerConfig(env);
    if ("error" in config) {
      return respond(
        errorJson(
          {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Accept",
          },
          503,
          "misconfigured",
          config.error,
        ),
      );
    }

    const { asaGameId, corsHeaders } = config;

    if (request.method === "OPTIONS") {
      return respond(new Response(null, { status: 204, headers: corsHeaders }));
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") {
        metrics.routeClass = "health";
        if (request.method !== "GET") {
          return respond(methodNotAllowed(corsHeaders, "GET"));
        }
        return respond(okJson(corsHeaders, { service: "yark-curseforge-proxy" }));
      }

      const apiKey = (env.CURSEFORGE_API_KEY ?? "").trim();
      if (apiKey.length === 0) {
        return respond(
          errorJson(
            corsHeaders,
            503,
            "missing_api_key",
            "CurseForge proxy is not configured. Set the Worker secret in Cloudflare.",
          ),
        );
      }

      if (url.pathname === "/v1/mods/search") {
        metrics.routeClass = "search";
        if (request.method !== "GET") {
          return respond(methodNotAllowed(corsHeaders, "GET"));
        }
        const limited = await enforceRateLimit(
          env.RATE_LIMIT_SEARCH,
          request,
          "search",
          corsHeaders,
          metrics,
        );
        if (limited !== null) return respond(limited);
        return respond(
          await handleSearch(url, apiKey, asaGameId, corsHeaders, metrics),
        );
      }

      if (url.pathname === "/v1/categories") {
        metrics.routeClass = "read";
        if (request.method !== "GET") {
          return respond(methodNotAllowed(corsHeaders, "GET"));
        }
        const limited = await enforceRateLimit(
          env.RATE_LIMIT_READ,
          request,
          "read",
          corsHeaders,
          metrics,
        );
        if (limited !== null) return respond(limited);
        return respond(
          await handleCategories(url, apiKey, asaGameId, corsHeaders, metrics),
        );
      }

      if (url.pathname === "/v1/mods") {
        metrics.routeClass = "batch";
        if (request.method !== "POST") {
          return respond(methodNotAllowed(corsHeaders, "POST"));
        }
        const limited = await enforceRateLimit(
          env.RATE_LIMIT_BATCH,
          request,
          "batch",
          corsHeaders,
          metrics,
        );
        if (limited !== null) return respond(limited);
        return respond(
          await handleGetMods(request, apiKey, asaGameId, corsHeaders, metrics),
        );
      }

      const modMatch = /^\/v1\/mods\/(\d+)$/.exec(url.pathname);
      if (modMatch !== null) {
        metrics.routeClass = "read";
        if (request.method !== "GET") {
          return respond(methodNotAllowed(corsHeaders, "GET"));
        }
        const limited = await enforceRateLimit(
          env.RATE_LIMIT_READ,
          request,
          "read",
          corsHeaders,
          metrics,
        );
        if (limited !== null) return respond(limited);
        return respond(
          await handleGetMod(
            modMatch[1]!,
            apiKey,
            asaGameId,
            corsHeaders,
            metrics,
          ),
        );
      }

      return respond(errorJson(corsHeaders, 404, "not_found", "Unknown route."));
    } catch (cause) {
      return respond(
        errorJson(corsHeaders, 502, "proxy_error", sanitizeErrorMessage(cause)),
      );
    }
  },
};

async function enforceRateLimit(
  limiter: RateLimiter | undefined,
  request: Request,
  routeClass: "search" | "read" | "batch",
  corsHeaders: CorsHeaders,
  metrics: RequestMetrics,
): Promise<Response | null> {
  if (limiter === undefined) return null;
  const ip = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  const { success } = await limiter.limit({ key: `${routeClass}:${ip}` });
  if (success) return null;
  metrics.rateLimited = true;
  return errorJson(
    corsHeaders,
    429,
    "rate_limited",
    "Too many requests. Try again in a moment.",
  );
}

async function handleGetMod(
  modId: string,
  apiKey: string,
  asaGameId: number,
  corsHeaders: CorsHeaders,
  metrics: RequestMetrics,
): Promise<Response> {
  const cacheKeyUrl = `${CACHE_KEY_ORIGIN}/v1/mods/${modId}`;
  const cached = await matchCachedResponse(cacheKeyUrl);
  if (cached !== null) {
    metrics.cache = "HIT";
    return withCacheHeader(cached, "HIT", corsHeaders);
  }

  metrics.cache = "MISS";
  const upstream = await fetchUpstream(
    `${UPSTREAM}/v1/mods/${modId}`,
    { method: "GET", headers: upstreamHeaders(apiKey) },
    metrics,
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

  // Inspect drawer needs plain description for all mods (#342). Search stays
  // null; batch stays Maps-only to avoid N+1 quota burn on profile refresh.
  const description = await fetchModDescription(modId, apiKey, metrics);
  const response = okJson(corsHeaders, toYarkMod(rawMod, description));
  await putCachedResponse(cacheKeyUrl, response, CACHE_TTL_READ_SECONDS);
  return withCacheHeader(response, "MISS", corsHeaders);
}

async function handleGetMods(
  request: Request,
  apiKey: string,
  asaGameId: number,
  corsHeaders: CorsHeaders,
  metrics: RequestMetrics,
): Promise<Response> {
  metrics.cache = "BYPASS";
  const bodyResult = await readJsonBody(request, corsHeaders);
  if (!bodyResult.ok) return bodyResult.response;

  let modIds: number[];
  try {
    const parsed = bodyResult.value as { modIds?: unknown };
    if (!Array.isArray(parsed.modIds)) {
      return errorJson(
        corsHeaders,
        400,
        "invalid_body",
        'Body must be { "modIds": number[] }.',
      );
    }
    if (parsed.modIds.length > MAX_BATCH_MOD_IDS) {
      return errorJson(
        corsHeaders,
        400,
        "too_many_mod_ids",
        `A batch may contain at most ${MAX_BATCH_MOD_IDS} modIds.`,
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

  const upstream = await fetchUpstream(
    `${UPSTREAM}/v1/mods`,
    {
      method: "POST",
      headers: {
        ...upstreamHeaders(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ modIds }),
    },
    metrics,
  );
  if (!upstream.ok) {
    return mapUpstreamError(corsHeaders, upstream.status, upstream.bodyText);
  }

  const rawMods = extractModList(upstream.json);
  const byId = new Map<number, Record<string, unknown>>();
  for (const mod of rawMods) {
    const id = Number(mod["id"]);
    if (Number.isFinite(id)) byId.set(id, mod);
  }

  const asaMods: Array<{ id: number; raw: Record<string, unknown> }> = [];
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
    asaMods.push({ id, raw });
  }

  // Only Maps-category mods need /description for map-token heuristics; fetching
  // for every ASA id in the batch is an N+1 that slows the UI and burns CF quota.
  const mapMods = asaMods.filter(({ raw }) => isMapsCategoryMod(raw));
  const descriptions = new Map<number, string | null>();
  await Promise.all(
    mapMods.map(async ({ id }) => {
      descriptions.set(id, await fetchModDescription(String(id), apiKey, metrics));
    }),
  );
  const items: YarkModMetadata[] = asaMods.map(({ id, raw }) =>
    toYarkMod(raw, descriptions.get(id) ?? null),
  );

  return okJson(corsHeaders, { items, skipped });
}

async function handleSearch(
  clientUrl: URL,
  apiKey: string,
  asaGameId: number,
  corsHeaders: CorsHeaders,
  metrics: RequestMetrics,
): Promise<Response> {
  const searchFilter = clientUrl.searchParams.get("searchFilter");
  if (
    searchFilter !== null &&
    searchFilter.length > MAX_SEARCH_FILTER_LENGTH
  ) {
    return errorJson(
      corsHeaders,
      400,
      "invalid_search_filter",
      `searchFilter may contain at most ${MAX_SEARCH_FILTER_LENGTH} characters.`,
    );
  }

  const rawPageSize = clientUrl.searchParams.get("pageSize");
  if (rawPageSize !== null) {
    const pageSize = Number(rawPageSize);
    if (
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > MAX_SEARCH_PAGE_SIZE
    ) {
      return errorJson(
        corsHeaders,
        400,
        "invalid_page_size",
        `pageSize must be an integer from 1 to ${MAX_SEARCH_PAGE_SIZE}.`,
      );
    }
  }

  const rawIndex = clientUrl.searchParams.get("index");
  if (rawIndex !== null) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) {
      return errorJson(
        corsHeaders,
        400,
        "invalid_index",
        "index must be a non-negative integer.",
      );
    }
  }

  const cacheKeyUrl = buildSearchCacheKey(clientUrl);
  const cached = await matchCachedResponse(cacheKeyUrl);
  if (cached !== null) {
    metrics.cache = "HIT";
    return withCacheHeader(cached, "HIT", corsHeaders);
  }

  metrics.cache = "MISS";
  const upstreamUrl = new URL(`${UPSTREAM}/v1/mods/search`);
  upstreamUrl.searchParams.set("gameId", String(asaGameId));

  for (const key of SEARCH_FORWARD_PARAMS) {
    const value = clientUrl.searchParams.get(key);
    if (value !== null && value.length > 0) {
      upstreamUrl.searchParams.set(key, value);
    }
  }

  const upstream = await fetchUpstream(
    upstreamUrl.toString(),
    {
      method: "GET",
      headers: upstreamHeaders(apiKey),
    },
    metrics,
  );
  if (!upstream.ok) {
    return mapUpstreamError(corsHeaders, upstream.status, upstream.bodyText);
  }

  const rawMods = extractModList(upstream.json);
  const items: YarkModMetadata[] = [];
  for (const mod of rawMods) {
    if (isAsaMod(mod, asaGameId)) {
      items.push(toYarkMod(mod, null));
    }
  }

  const pagination = extractPagination(upstream.json);
  const response = okJson(corsHeaders, {
    items,
    pagination,
  });
  await putCachedResponse(cacheKeyUrl, response, CACHE_TTL_SEARCH_SECONDS);
  return withCacheHeader(response, "MISS", corsHeaders);
}

/**
 * Proxies CurseForge `GET /v1/categories` for ASA (`gameId` pinned).
 * Optional `classId` / `classesOnly` query params are forwarded when present.
 * Category/class IDs are CurseForge-owned — callers must not invent them (#297).
 */
async function handleCategories(
  clientUrl: URL,
  apiKey: string,
  asaGameId: number,
  corsHeaders: CorsHeaders,
  metrics: RequestMetrics,
): Promise<Response> {
  const cacheKeyUrl = buildCategoriesCacheKey(clientUrl, asaGameId);
  const cached = await matchCachedResponse(cacheKeyUrl);
  if (cached !== null) {
    metrics.cache = "HIT";
    return withCacheHeader(cached, "HIT", corsHeaders);
  }

  metrics.cache = "MISS";
  const upstreamUrl = new URL(`${UPSTREAM}/v1/categories`);
  upstreamUrl.searchParams.set("gameId", String(asaGameId));

  const classId = clientUrl.searchParams.get("classId");
  if (classId !== null && classId.length > 0) {
    upstreamUrl.searchParams.set("classId", classId);
  }
  const classesOnly = clientUrl.searchParams.get("classesOnly");
  if (classesOnly === "true" || classesOnly === "1") {
    upstreamUrl.searchParams.set("classesOnly", "true");
  }

  const upstream = await fetchUpstream(
    upstreamUrl.toString(),
    {
      method: "GET",
      headers: upstreamHeaders(apiKey),
    },
    metrics,
  );
  if (!upstream.ok) {
    return mapUpstreamError(corsHeaders, upstream.status, upstream.bodyText);
  }

  // Upstream already scoped by gameId; keep a soft guard for stray rows but
  // accept missing/0 gameId (some category payloads omit it).
  const categories = extractCategories(upstream.json)
    .filter(
      (entry) =>
        entry.gameId === asaGameId || entry.gameId === 0,
    )
    .map(({ gameId: _gameId, ...category }) => category);
  const response = okJson(corsHeaders, { categories });
  await putCachedResponse(cacheKeyUrl, response, CACHE_TTL_CATEGORIES_SECONDS);
  return withCacheHeader(response, "MISS", corsHeaders);
}

async function fetchModDescription(
  modId: string,
  apiKey: string,
  metrics: RequestMetrics,
): Promise<string | null> {
  try {
    const upstream = await fetchUpstream(
      `${UPSTREAM}/v1/mods/${modId}/description?stripped=true`,
      { method: "GET", headers: upstreamHeaders(apiKey) },
      metrics,
    );
    if (!upstream.ok) {
      return null;
    }
    const root = asRecord(upstream.json);
    const data = root?.["data"];
    if (typeof data !== "string") {
      return null;
    }
    const trimmed = data.trim();
    if (trimmed.length === 0) {
      return null;
    }
    return trimmed.length > MAX_DESCRIPTION_CHARS
      ? trimmed.slice(0, MAX_DESCRIPTION_CHARS)
      : trimmed;
  } catch {
    return null;
  }
}

/** Aligns with Electron `isMapModCandidate` (CurseForge "Maps" / "Map"). */
function isMapsCategoryMod(mod: Record<string, unknown>): boolean {
  return extractCategoryNames(mod).some((entry) => /\bmaps?\b/i.test(entry));
}

function extractCategoryNames(mod: Record<string, unknown>): string[] {
  const categoriesRaw = Array.isArray(mod["categories"]) ? mod["categories"] : [];
  return categoriesRaw
    .map((entry) => {
      const row = asRecord(entry);
      return typeof row?.["name"] === "string" ? row["name"] : null;
    })
    .filter((name): name is string => name !== null && name.length > 0);
}

function extractScreenshotUrls(mod: Record<string, unknown>): string[] {
  const raw = Array.isArray(mod["screenshots"]) ? mod["screenshots"] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const row = asRecord(entry);
    if (row === null) continue;
    const candidate =
      typeof row["url"] === "string" && row["url"].length > 0
        ? row["url"]
        : typeof row["thumbnailUrl"] === "string" && row["thumbnailUrl"].length > 0
          ? row["thumbnailUrl"]
          : null;
    if (candidate === null) continue;
    const url = candidate.trim();
    if (!/^https:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_SCREENSHOT_URLS) break;
  }
  return out;
}

function toYarkMod(
  mod: Record<string, unknown>,
  description: string | null,
): YarkModMetadata {
  const id = String(mod["id"] ?? "");
  const slug = String(mod["slug"] ?? id);
  const links = asRecord(mod["links"]);
  const logo = asRecord(mod["logo"]);
  const authorsRaw = Array.isArray(mod["authors"]) ? mod["authors"] : [];

  const authors = authorsRaw
    .map((entry) => {
      const row = asRecord(entry);
      return typeof row?.["name"] === "string" ? row["name"] : null;
    })
    .filter((name): name is string => name !== null && name.length > 0);

  const categories = extractCategoryNames(mod);

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
    description,
    thumbnailUrl: thumbnail,
    screenshots: extractScreenshotUrls(mod),
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

function isAllowedUpstreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // HTTPS only — API key headers must never follow an HTTPS→HTTP downgrade.
    return (
      parsed.protocol === "https:"
      && parsed.hostname.toLowerCase() === UPSTREAM_HOST
    );
  } catch {
    return false;
  }
}

async function fetchUpstream(
  url: string,
  init: RequestInit,
  metrics: RequestMetrics,
): Promise<{ ok: boolean; status: number; bodyText: string; json: unknown }> {
  const timeoutSignal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  const signal =
    init.signal === undefined || init.signal === null
      ? timeoutSignal
      : AbortSignal.any([init.signal, timeoutSignal]);

  let currentUrl = url;
  for (let hop = 0; hop <= MAX_UPSTREAM_REDIRECTS; hop += 1) {
    if (!isAllowedUpstreamUrl(currentUrl)) {
      metrics.upstreamStatus = 502;
      return {
        ok: false,
        status: 502,
        bodyText: "Blocked upstream redirect to a non-CurseForge host.",
        json: null,
      };
    }
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        ...init,
        signal,
        redirect: "manual",
      });
    } catch (cause) {
      if (isAbortError(cause)) {
        metrics.upstreamStatus = 504;
        return {
          ok: false,
          status: 504,
          bodyText: "Upstream request timed out.",
          json: null,
        };
      }
      throw cause;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (location === null || location.length === 0) {
        metrics.upstreamStatus = 502;
        return {
          ok: false,
          status: 502,
          bodyText: "Upstream redirect missing Location.",
          json: null,
        };
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    const bodyText = await response.text();
    let json: unknown = null;
    try {
      json = bodyText.length > 0 ? JSON.parse(bodyText) : null;
    } catch {
      json = null;
    }
    metrics.upstreamStatus = response.status;
    return {
      ok: response.ok,
      status: response.status,
      bodyText,
      json,
    };
  }
  metrics.upstreamStatus = 502;
  return {
    ok: false,
    status: 502,
    bodyText: "Too many upstream redirects.",
    json: null,
  };
}

function mapUpstreamError(
  corsHeaders: CorsHeaders,
  status: number,
  bodyText: string,
): Response {
  void bodyText;
  if (status === 504) {
    return errorJson(
      corsHeaders,
      504,
      "upstream_timeout",
      "CurseForge request timed out. Try again in a moment.",
    );
  }
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

async function readJsonBody(
  request: Request,
  corsHeaders: CorsHeaders,
): Promise<
  { ok: true; value: unknown } | { ok: false; response: Response }
> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null && contentLength.length > 0) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > MAX_POST_BODY_BYTES) {
      return {
        ok: false,
        response: errorJson(
          corsHeaders,
          413,
          "body_too_large",
          `Request body may be at most ${MAX_POST_BODY_BYTES} bytes.`,
        ),
      };
    }
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return {
      ok: false,
      response: errorJson(
        corsHeaders,
        400,
        "invalid_body",
        'Body must be JSON { "modIds": number[] }.',
      ),
    };
  }

  if (buffer.byteLength > MAX_POST_BODY_BYTES) {
    return {
      ok: false,
      response: errorJson(
        corsHeaders,
        413,
        "body_too_large",
        `Request body may be at most ${MAX_POST_BODY_BYTES} bytes.`,
      ),
    };
  }

  try {
    const text = new TextDecoder("utf-8").decode(buffer);
    if (text.trim().length === 0) {
      return {
        ok: false,
        response: errorJson(
          corsHeaders,
          400,
          "invalid_body",
          'Body must be JSON { "modIds": number[] }.',
        ),
      };
    }
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: errorJson(
        corsHeaders,
        400,
        "invalid_body",
        'Body must be JSON { "modIds": number[] }.',
      ),
    };
  }
}

function buildSearchCacheKey(clientUrl: URL): string {
  // Same allow-listed, single-valued params as upstream forwarding — ignore junk
  // query keys so callers cannot bust cache cardinality (#70 review).
  const params = new URLSearchParams();
  for (const key of [...SEARCH_FORWARD_PARAMS].sort()) {
    const value = clientUrl.searchParams.get(key);
    if (value !== null && value.length > 0) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query.length > 0
    ? `${CACHE_KEY_ORIGIN}/v1/mods/search?${query}`
    : `${CACHE_KEY_ORIGIN}/v1/mods/search`;
}

function buildCategoriesCacheKey(clientUrl: URL, asaGameId: number): string {
  const params = new URLSearchParams();
  params.set("gameId", String(asaGameId));
  const classId = clientUrl.searchParams.get("classId");
  if (classId !== null && classId.length > 0) {
    params.set("classId", classId);
  }
  const classesOnly = clientUrl.searchParams.get("classesOnly");
  if (classesOnly === "true" || classesOnly === "1") {
    params.set("classesOnly", "true");
  }
  return `${CACHE_KEY_ORIGIN}/v1/categories?${params.toString()}`;
}

interface YarkModCategory {
  id: number;
  name: string;
  slug: string;
  isClass: boolean;
  classId: number | null;
  parentCategoryId: number | null;
  displayIndex: number | null;
  gameId: number;
}

function extractCategories(json: unknown): YarkModCategory[] {
  const root = asRecord(json);
  const data = root?.["data"];
  if (!Array.isArray(data)) return [];
  const out: YarkModCategory[] = [];
  for (const entry of data) {
    const row = asRecord(entry);
    if (row === null) continue;
    const id = row["id"];
    const name = row["name"];
    const slug = row["slug"];
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (typeof name !== "string" || name.length === 0) continue;
    if (typeof slug !== "string" || slug.length === 0) continue;
    const gameIdRaw = row["gameId"];
    const gameId =
      typeof gameIdRaw === "number" && Number.isInteger(gameIdRaw) ? gameIdRaw : 0;
    out.push({
      id,
      name,
      slug,
      isClass: row["isClass"] === true,
      classId: nullablePositiveInt(row["classId"]),
      parentCategoryId: nullablePositiveInt(row["parentCategoryId"]),
      displayIndex:
        typeof row["displayIndex"] === "number" &&
        Number.isInteger(row["displayIndex"])
          ? row["displayIndex"]
          : null,
      gameId,
    });
  }
  return out;
}

function nullablePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

async function matchCachedResponse(cacheKeyUrl: string): Promise<Response | null> {
  const cache = getEdgeCache();
  if (cache === null) return null;
  try {
    const matched = await cache.match(new Request(cacheKeyUrl, { method: "GET" }));
    return matched ?? null;
  } catch {
    return null;
  }
}

async function putCachedResponse(
  cacheKeyUrl: string,
  response: Response,
  ttlSeconds: number,
): Promise<void> {
  if (response.status !== 200) return;
  const cache = getEdgeCache();
  if (cache === null) return;
  try {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
    const toStore = new Response(await response.clone().arrayBuffer(), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    await cache.put(new Request(cacheKeyUrl, { method: "GET" }), toStore);
  } catch {
    // Cache is best-effort; never fail the client response.
  }
}

/** Workers expose `caches.default`; DOM `CacheStorage` typings omit it. */
type WorkersCacheStorage = CacheStorage & { default: Cache };

function getEdgeCache(): Cache | null {
  try {
    const cachesApi = (globalThis as unknown as { caches?: WorkersCacheStorage })
      .caches;
    if (cachesApi === undefined) return null;
    return cachesApi.default;
  } catch {
    return null;
  }
}

function withCacheHeader(
  response: Response,
  outcome: "HIT" | "MISS",
  corsHeaders: CorsHeaders,
): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  // Cache-Control on stored edge entries is for Cache API TTL only. Do not leak
  // public max-age to clients (HIT would otherwise differ from MISS).
  headers.delete("Cache-Control");
  headers.delete("Expires");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Yark-Cache", outcome);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function methodNotAllowed(corsHeaders: CorsHeaders, allow: string): Response {
  const headers = {
    ...corsHeaders,
    Allow: allow,
  };
  return errorJson(headers, 405, "method_not_allowed", `Use ${allow} for this route.`);
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

function logRequest(
  metrics: RequestMetrics,
  status: number,
  latencyMs: number,
): void {
  // Privacy: never log API keys, bearer tokens, searchFilter text, full IPs, or bodies.
  console.log(
    JSON.stringify({
      service: "yark-curseforge-proxy",
      routeClass: metrics.routeClass,
      method: metrics.method,
      status,
      latencyMs,
      cache: metrics.cache,
      upstreamStatus: metrics.upstreamStatus,
      rateLimited: metrics.rateLimited,
    }),
  );
}

function sanitizeErrorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return redactSecrets(cause.message) || "Proxy error";
  }
  return "Proxy error";
}

function isAbortError(cause: unknown): boolean {
  if (cause === null || typeof cause !== "object") return false;
  const name = (cause as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
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
