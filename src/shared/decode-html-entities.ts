import { HTML_NAMED_ENTITIES } from "./html-named-entities";

/**
 * Decode HTML character references in CurseForge stripped descriptions.
 * Does not parse tags — only named and numeric entities.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) {
    return text;
  }
  return text.replace(
    /&(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]*);/gi,
    (entity, body: string) => {
      if (body.startsWith("#")) {
        const isHex = body[1]?.toLowerCase() === "x";
        const digits = isHex ? body.slice(2) : body.slice(1);
        const codePoint = Number.parseInt(digits, isHex ? 16 : 10);
        if (!Number.isFinite(codePoint) || codePoint < 0) {
          return entity;
        }
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return entity;
        }
      }
      return HTML_NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    },
  );
}
