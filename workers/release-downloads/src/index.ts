/**
 * YARK release download counter (Cloudflare Worker).
 *
 * A scheduled job sums GitHub Release asset downloads for installers only
 * (`*.exe`), so the Shields badge and getyark.com can report real install
 * downloads instead of Shields' built-in total (which also counts
 * `.blockmap`, `.yml`, and `.sha256` assets).
 *
 * The count only moves when the cron runs; GitHub's `download_count` is
 * batch-updated and can lag hours behind real downloads.
 *
 * Runbook: docs/release-downloads.md
 */

import { safeEqual, sumExeDownloads, type GitHubRelease } from "./counting";

interface Env {
  /** KV namespace holding the last good count (`exe`, `updatedAt`). */
  DOWNLOADS: KVNamespace;
  /** `owner/repo` to count. Public info; committed as a var. */
  GITHUB_REPOSITORY: string;
  /** Optional read-only GitHub token. Add only if unauthenticated limits hit. */
  GITHUB_TOKEN?: string;
  /** Secret enabling `GET /refresh?token=…`. Absent ⇒ refresh route is off. */
  REFRESH_TOKEN?: string;
}

const PER_PAGE = 100;
/** 2000 releases is far past any real history; also stops a runaway loop. */
const MAX_PAGES = 20;

async function countExeDownloads(env: Env): Promise<number> {
  const headers: Record<string, string> = {
    "User-Agent": "yark-release-downloads",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/releases?per_page=${PER_PAGE}&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`github releases page ${page}: ${res.status}`);
    const releases = (await res.json()) as GitHubRelease[];
    if (!Array.isArray(releases) || releases.length === 0) break;
    total += sumExeDownloads(releases);
    if (releases.length < PER_PAGE) break;
  }
  return total;
}

/**
 * Refresh KV from GitHub. Throws on failure, which is intentional: KV keeps
 * the previous count, so a GitHub outage or rate limit never blanks the badge.
 */
async function refresh(env: Env): Promise<void> {
  const total = await countExeDownloads(env);
  await env.DOWNLOADS.put("exe", String(total));
  await env.DOWNLOADS.put("updatedAt", new Date().toISOString());
}

async function readCount(env: Env): Promise<{ downloads: number; updatedAt: string | null }> {
  return {
    downloads: Number(await env.DOWNLOADS.get("exe")) || 0,
    updatedAt: await env.DOWNLOADS.get("updatedAt"),
  };
}

const CACHEABLE_JSON = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300",
};

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await refresh(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Manual recount. Cloudflare has no "run now" in the dashboard (the Quick
    // Edit trigger button is unreliable), so a fetch route is the sanctioned
    // way to force a refresh. Guarded by a secret; 404 hides the route when
    // unconfigured or the token is wrong.
    if (url.pathname === "/refresh") {
      const token = url.searchParams.get("token") ?? "";
      if (!env.REFRESH_TOKEN || !safeEqual(token, env.REFRESH_TOKEN)) {
        return new Response("Not found", { status: 404 });
      }
      try {
        await refresh(env);
      } catch (error) {
        return Response.json(
          { ok: false, error: String(error) },
          { status: 502, headers: { "Cache-Control": "no-store" } },
        );
      }
      return Response.json(await readCount(env), { headers: { "Cache-Control": "no-store" } });
    }

    // Public JSON for the Shields badge and getyark.com (client-side fetch).
    return Response.json(await readCount(env), { headers: CACHEABLE_JSON });
  },
} satisfies ExportedHandler<Env>;
