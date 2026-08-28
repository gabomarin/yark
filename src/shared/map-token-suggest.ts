import { isOfficialMap } from "./map-identity";
import type { ModMetadata } from "./types";

/** Labels that identify CurseForge ASA map mods. */
const MAP_CATEGORY_PATTERN = /\bmaps?\b/i;

/**
 * Labeled `Map Name:` / `Server Name:` matches accept official `KNOWN_MAPS` tokens
 * so Rootservers remasters (e.g. Island Reforged → `TheIsland_WP`) infer correctly.
 * Bare `*_WP` scans still skip official tokens to avoid false positives in prose.
 * Tradeoff: a custom map whose author labels an official token may infer wrong —
 * confirm step and Search Maps category filter remain the operator guardrails.
 *
 * `\b` fails when CurseForge stripped text glues the next label (`Bjarnheim_WPMod ID`).
 * Patterns omit the `i` flag so `(?![a-z0-9_])` still allows an uppercase continuation.
 */
const LABELED_TOKEN_PATTERNS: RegExp[] = [
  /[Mm][Aa][Pp]\s*[Nn][Aa][Mm][Ee]\s*:\s*([A-Za-z][A-Za-z0-9_]*_WP)(?![a-z0-9_])/,
  /[Ss][Ee][Rr][Vv][Ee][Rr]\s*[Nn][Aa][Mm][Ee]\s*:\s*([A-Za-z][A-Za-z0-9_]*_WP)(?![a-z0-9_])/,
  /\b[Mm][Aa][Pp]\s*:\s*([A-Za-z][A-Za-z0-9_]*_WP)(?![a-z0-9_])/,
];

const BARE_TOKEN_PATTERN = /\b([A-Za-z][A-Za-z0-9_]*_WP)(?![a-z0-9_])/g;

export interface MapTokenSuggestion {
  token: string;
  /** How the token was found. */
  source: "labeled" | "bare";
  /** Snippet index among matches (0-based). */
  matchIndex: number;
}

/** True when a CurseForge category label is Maps / Map. */
export function isMapCategoryLabel(label: string): boolean {
  return MAP_CATEGORY_PATTERN.test(label);
}

/** True when mod metadata looks like a CurseForge Maps-category project. */
export function isMapModCandidate(meta: Pick<ModMetadata, "categories">): boolean {
  return (meta.categories ?? []).some(isMapCategoryLabel);
}

/**
 * Extract a likely ASA launch map token from author-style mod text
 * (`Map Name: Foo_WP`, `Server Name: …`, or bare `*_WP`).
 */
export function suggestMapTokenFromModText(text: string): MapTokenSuggestion | null {
  const haystack = text.trim();
  if (haystack.length === 0) {
    return null;
  }

  for (const pattern of LABELED_TOKEN_PATTERNS) {
    const match = pattern.exec(haystack);
    if (match?.[1]) {
      return { token: match[1], source: "labeled", matchIndex: 0 };
    }
  }

  const bare: string[] = [];
  for (const match of haystack.matchAll(BARE_TOKEN_PATTERN)) {
    const token = match[1];
    if (token && !isOfficialMap(token) && !bare.includes(token)) {
      bare.push(token);
    }
  }
  const firstBare = bare[0];
  if (firstBare) {
    return { token: firstBare, source: "bare", matchIndex: 0 };
  }

  // No labeled or non-official bare token found.
  return null;
}

/**
 * Prefer richer description text when present; otherwise name + summary + slug.
 * Description normally carries `Map Name:` for map packs (#195).
 */
export function buildModMapSuggestHaystack(
  meta: Pick<ModMetadata, "name" | "summary" | "slug" | "description">,
  descriptionOverride?: string | null,
): string {
  const description =
    descriptionOverride !== undefined && descriptionOverride !== null
      ? descriptionOverride
      : (meta.description ?? null);
  const parts = [meta.name, meta.summary, meta.slug];
  if (description && description.trim().length > 0) {
    parts.push(description);
  }
  return parts.filter((part) => part && part.trim().length > 0).join("\n");
}

export function suggestMapTokenFromMetadata(
  meta: Pick<ModMetadata, "name" | "summary" | "slug" | "categories" | "description">,
  descriptionOverride?: string | null,
): MapTokenSuggestion | null {
  return suggestMapTokenFromModText(
    buildModMapSuggestHaystack(meta, descriptionOverride),
  );
}
