const CURSEFORGE_HOST = /(^|\.)curseforge\.com$/i;
const ASA_MOD_PATH =
  /^\/ark-survival-ascended\/mods\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/i;

export function getCurseForgeAsaModUrlError(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return "Enter a CurseForge mod URL.";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a valid URL, including https://.";
  }
  if (url.protocol !== "https:") {
    return "The CurseForge mod URL must use https://.";
  }
  if (!CURSEFORGE_HOST.test(url.hostname)) {
    return "The mod URL must use curseforge.com.";
  }
  if (ASA_MOD_PATH.exec(url.pathname) === null) {
    return "Use an Ark: Survival Ascended CurseForge mod detail URL.";
  }
  return null;
}

export function curseForgeAsaSlugFromUrl(raw: string): string {
  const error = getCurseForgeAsaModUrlError(raw);
  if (error !== null) throw new Error(error);
  const match = ASA_MOD_PATH.exec(new URL(raw.trim()).pathname);
  const slug = match?.[1];
  if (slug === undefined) throw new Error("The mod URL does not include a slug.");
  return slug.toLowerCase();
}

export function canonicalCurseForgeAsaModUrl(raw: string): string {
  return `https://www.curseforge.com/ark-survival-ascended/mods/${
    curseForgeAsaSlugFromUrl(raw)
  }`;
}
