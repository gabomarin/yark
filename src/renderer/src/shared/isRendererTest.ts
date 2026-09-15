/** True in Vitest (jsdom). Never read `process.env` unless `process` exists (CDP/sandbox). */
export function isRendererTest(): boolean {
  return typeof process !== "undefined" && process.env?.VITEST === "true";
}
