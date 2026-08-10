/**
 * Tunable Worker config — values come from `wrangler.toml` `[vars]` / dashboard.
 * Secrets (`CURSEFORGE_API_KEY`) are never listed here.
 */

/** Cloudflare Workers Rate Limiting binding (see wrangler `[[ratelimits]]`). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /** Cloudflare secret — never commit. */
  CURSEFORGE_API_KEY: string;
  /** CurseForge game id for Ark: Survival Ascended (wrangler `[vars]`). */
  ASA_GAME_ID: string;
  /**
   * CORS Access-Control-Allow-Origin (wrangler `[vars]`).
   * Electron main-process fetch has no browser origin; `*` is acceptable.
   */
  CORS_ALLOW_ORIGIN: string;
  /** Search route class — tighter (amplification path). */
  RATE_LIMIT_SEARCH?: RateLimiter;
  /** GET single-mod route class. */
  RATE_LIMIT_READ?: RateLimiter;
  /** POST batch route class. */
  RATE_LIMIT_BATCH?: RateLimiter;
}

export interface WorkerConfig {
  asaGameId: number;
  corsAllowOrigin: string;
  corsHeaders: Record<string, string>;
}

export function resolveWorkerConfig(env: Env): WorkerConfig | { error: string } {
  const asaGameId = Number(String(env.ASA_GAME_ID ?? "").trim());
  if (!Number.isInteger(asaGameId) || asaGameId <= 0) {
    return {
      error:
        "ASA_GAME_ID is missing or invalid. Set it in wrangler.toml [vars] or the Cloudflare dashboard.",
    };
  }

  const corsAllowOrigin = String(env.CORS_ALLOW_ORIGIN ?? "").trim() || "*";

  return {
    asaGameId,
    corsAllowOrigin,
    corsHeaders: {
      "Access-Control-Allow-Origin": corsAllowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  };
}
