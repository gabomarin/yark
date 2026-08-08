import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import {
  curseForgeAsaSlugFromUrl,
  getCurseForgeAsaModUrlError,
} from "@shared/curseforge-url";
import type {
  ModMetadata,
  ModSearchPage,
  ServerProfileInput,
} from "@shared/types";
import {
  MOCK_MOD_CATALOG,
  buildPlaceholderMetadata,
} from "./mock-mod-catalog";

/** Default deployed Worker (override via env or app setting). */
export const DEFAULT_CURSEFORGE_PROXY_URL =
  "https://yark-curseforge-proxy.gabomarin26.workers.dev";

export const CURSEFORGE_PROXY_URL_SETTING_KEY = "curseforgeProxyUrl";

export interface ModsServiceOptions {
  settings?: AppSettingsRepository;
  /** Explicit base URL (wins over settings / default; loses to env). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /**
   * Offline / unit tests: serve `MOCK_MOD_CATALOG` instead of the Worker.
   * Production main process leaves this false.
   */
  useMockCatalog?: boolean;
}

interface WorkerErrorBody {
  ok: false;
  error: { code: string; message: string };
}

interface WorkerSuccessBody<T> {
  ok: true;
  data: T;
}

type WorkerEnvelope<T> = WorkerSuccessBody<T> | WorkerErrorBody;

/**
 * Resolves ASA mod metadata via the CurseForge proxy Worker.
 * The API key never leaves Cloudflare.
 */
export class ModsService {
  private readonly settings: AppSettingsRepository | undefined;
  private readonly explicitBaseUrl: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly useMockCatalog: boolean;

  constructor(options: ModsServiceOptions = {}) {
    this.settings = options.settings;
    this.explicitBaseUrl = options.baseUrl?.trim() || undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.useMockCatalog = options.useMockCatalog === true;
  }

  getBaseUrl(): string {
    const fromEnv = process.env.YARK_CURSEFORGE_PROXY_URL?.trim();
    if (fromEnv && fromEnv.length > 0) return stripTrailingSlash(fromEnv);
    if (this.explicitBaseUrl) return stripTrailingSlash(this.explicitBaseUrl);
    const fromSettings = this.settings?.get(CURSEFORGE_PROXY_URL_SETTING_KEY)?.trim();
    if (fromSettings && fromSettings.length > 0) {
      return stripTrailingSlash(fromSettings);
    }
    return DEFAULT_CURSEFORGE_PROXY_URL;
  }

  async getMod(modId: string, _options?: { forceRefresh?: boolean }): Promise<ModMetadata> {
    const id = normalizeModId(modId);
    if (this.useMockCatalog) {
      return MOCK_MOD_CATALOG[id] ?? buildPlaceholderMetadata(id);
    }
    return this.fetchJson<ModMetadata>(`/v1/mods/${id}`);
  }

  /**
   * Batch-resolve metadata. Returns only successfully resolved items (request
   * order). Skipped / missing IDs are omitted — callers that require every ID
   * must check the result length themselves.
   */
  async getMods(
    modIds: string[],
    options?: { forceRefresh?: boolean },
  ): Promise<ModMetadata[]> {
    const unique = [...new Set(modIds.map(normalizeModId))];
    if (unique.length === 0) return [];
    if (this.useMockCatalog) {
      const result: ModMetadata[] = [];
      for (const id of unique) {
        result.push(await this.getMod(id, options));
      }
      return result;
    }

    const data = await this.fetchJson<{
      items: ModMetadata[];
      skipped: Array<{ id: string; reason: string }>;
    }>("/v1/mods", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // Send strings; Worker accepts number|string and parses safely.
      body: JSON.stringify({ modIds: unique }),
    });

    const byId = new Map(
      data.items.map((item) => {
        const normalized = normalizeMetadata(item);
        return [normalized.id, normalized] as const;
      }),
    );
    return unique.flatMap((id) => {
      const item = byId.get(id);
      return item === undefined ? [] : [item];
    });
  }

  async search(
    query: string,
    options?: { index?: number; pageSize?: number },
  ): Promise<ModSearchPage> {
    const searchFilter = query.trim();
    if (this.useMockCatalog) {
      const items = Object.values(MOCK_MOD_CATALOG).filter((item) => {
        if (searchFilter.length === 0) return true;
        const haystack = `${item.name} ${item.summary} ${item.slug}`.toLowerCase();
        return haystack.includes(searchFilter.toLowerCase());
      });
      return {
        items,
        pagination: {
          index: 0,
          pageSize: items.length,
          resultCount: items.length,
          totalCount: items.length,
        },
      };
    }

    const params = new URLSearchParams();
    if (searchFilter.length > 0) params.set("searchFilter", searchFilter);
    if (options?.index !== undefined) params.set("index", String(options.index));
    if (options?.pageSize !== undefined) {
      params.set("pageSize", String(options.pageSize));
    }
    const qs = params.toString();
    const data = await this.fetchJson<ModSearchPage>(
      `/v1/mods/search${qs.length > 0 ? `?${qs}` : ""}`,
    );
    return {
      items: data.items.map(normalizeMetadata),
      pagination: data.pagination,
    };
  }

  /**
   * Resolve metadata by Project ID, ASA CurseForge URL, or slug.
   */
  async getByReference(ref: string): Promise<ModMetadata> {
    const token = ref.trim();
    if (token.length === 0) {
      throw new Error("Enter a CurseForge Project ID or ASA mod URL.");
    }
    if (/^\d+$/.test(token)) {
      return this.getMod(token);
    }

    let slug: string;
    if (/^https?:\/\//i.test(token) || /curseforge\.com/i.test(token)) {
      const urlError = getCurseForgeAsaModUrlError(token);
      if (urlError !== null) throw new Error(urlError);
      slug = curseForgeAsaSlugFromUrl(token);
    } else if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(token)) {
      slug = token.toLowerCase();
    } else {
      throw new Error("Not a numeric CurseForge Project ID or ASA mod URL.");
    }

    if (this.useMockCatalog) {
      const match = Object.values(MOCK_MOD_CATALOG).find((item) => item.slug === slug);
      if (match === undefined) {
        throw new Error(`No mock catalog entry for slug "${slug}"`);
      }
      return match;
    }

    const params = new URLSearchParams({ slug });
    const data = await this.fetchJson<ModSearchPage>(`/v1/mods/search?${params}`);
    const match = data.items.find((item) => item.slug.toLowerCase() === slug);
    if (match === undefined) {
      throw new Error(`No ASA CurseForge mod found for slug "${slug}"`);
    }
    return normalizeMetadata(match);
  }

  /**
   * Ensures newly configured mod IDs have Worker-verified ASA metadata in cache.
   * Existing profile IDs are preserved without re-fetch (legacy / offline edits).
   * Client-supplied cache for new IDs is not trusted — always re-fetch from Worker.
   */
  async enrichNewServerMods(
    input: ServerProfileInput,
    existing: {
      mods: string[];
      disabledMods?: string[];
      modMetadataCache?: Record<string, ModMetadata>;
    },
  ): Promise<ServerProfileInput> {
    const existingIds = new Set(existing.mods);
    const cache: Record<string, ModMetadata> = {
      ...(existing.modMetadataCache ?? {}),
    };
    const toVerify: string[] = [];

    for (const id of input.mods) {
      if (!/^\d+$/.test(id.trim())) {
        throw new Error(`Invalid CurseForge Project ID: "${id}".`);
      }
      const normalized = normalizeModId(id);
      if (existingIds.has(normalized)) continue;
      toVerify.push(normalized);
    }

    if (toVerify.length > 0) {
      const fetched = await this.getMods(toVerify);
      const byId = new Map(fetched.map((item) => [item.id, item]));
      for (const id of toVerify) {
        const item = byId.get(id);
        if (item === undefined) {
          throw new Error(
            `Project ID ${id} was not added: metadata could not be resolved via CurseForge proxy`,
          );
        }
        const detailError = getCachedMetadataError(item, id);
        if (detailError !== null) {
          throw new Error(`Project ID ${id} was not added: ${detailError}`);
        }
        cache[id] = item;
      }
    }

    // Prefer UI cache refresh for IDs that already existed on the profile.
    for (const [id, detail] of Object.entries(input.modMetadataCache ?? {})) {
      if (existingIds.has(id)) {
        cache[id] = detail;
      }
    }

    // Drop cache entries for mods no longer configured.
    const configured = new Set(input.mods.map((id) => normalizeModId(id)));
    for (const id of Object.keys(cache)) {
      if (!configured.has(id)) delete cache[id];
    }

    return {
      ...input,
      mods: input.mods.map((id) => normalizeModId(id)),
      disabledMods: (input.disabledMods ?? existing.disabledMods ?? []).filter(
        (id) => configured.has(id.trim()),
      ),
      modMetadataCache: cache,
    };
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init?.headers ?? {}),
        },
      });
    } catch (cause) {
      throw new Error(
        `Could not reach CurseForge proxy at ${this.getBaseUrl()}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }

    let body: WorkerEnvelope<T>;
    try {
      body = (await response.json()) as WorkerEnvelope<T>;
    } catch {
      throw new Error(
        `CurseForge proxy returned a non-JSON response (HTTP ${response.status})`,
      );
    }

    if (!body.ok) {
      throw new Error(body.error?.message ?? `CurseForge proxy error (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new Error(`CurseForge proxy HTTP ${response.status}`);
    }
    return body.data;
  }
}

export function normalizeModId(raw: string): string {
  const id = raw.trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(
      `Invalid mod ID: "${raw}". Use the numeric CurseForge Project ID.`,
    );
  }
  // Reject leading zeros so Number()/Worker parsing cannot change the ID.
  if (/^0\d/.test(id)) {
    throw new Error(
      `Invalid mod ID: "${raw}". CurseForge Project IDs must not have leading zeros.`,
    );
  }
  if (!Number.isSafeInteger(Number(id))) {
    throw new Error(`Invalid mod ID: "${raw}". Project ID is out of range.`);
  }
  return id;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeMetadata(item: ModMetadata): ModMetadata {
  return {
    id: String(item.id),
    name: item.name,
    summary: item.summary,
    description: item.description ?? null,
    thumbnailUrl: item.thumbnailUrl,
    authors: [...item.authors],
    downloadCount: item.downloadCount,
    dateModified: item.dateModified,
    curseforgeUrl: item.curseforgeUrl,
    slug: item.slug,
    categories: item.categories ?? [],
  };
}

function getCachedMetadataError(
  detail: ModMetadata,
  expectedId: string,
): string | null {
  if (detail.id !== expectedId) {
    return `CurseForge returned Project ID ${detail.id} instead`;
  }
  const urlError = getCurseForgeAsaModUrlError(detail.curseforgeUrl);
  return urlError === null ? null : `CurseForge returned a non-ASA project`;
}
