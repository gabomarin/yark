import { describe, expect, it } from "vitest";
import {
  formatInvalidModAddTokens,
  isCurseForgeProjectId,
  parseModAddInput,
  prepareModAddApply,
} from "@shared/mod-add-input";
import type { ModMetadata } from "@shared/types";

const sampleDetail: ModMetadata = {
  id: "929420",
  name: "Super Spyglass Plus",
  summary: "Advanced information.",
  thumbnailUrl: null,
  authors: ["kavan87"],
  downloadCount: 1,
  dateModified: "2026-05-28T00:00:00.000Z",
  curseforgeUrl:
    "https://www.curseforge.com/ark-survival-ascended/mods/super-spyglass-plus",
  slug: "super-spyglass-plus",
  categories: ["General"],
};

describe("parseModAddInput", () => {
  it("accepts numeric Project IDs", () => {
    expect(parseModAddInput("928793, 929420,928793")).toEqual({
      ids: ["928793", "929420"],
      urls: [],
      invalid: [],
    });
  });

  it("accepts an ASA CurseForge mod URL", () => {
    const url =
      "https://www.curseforge.com/ark-survival-ascended/mods/awesomespyglass";
    expect(parseModAddInput(url)).toEqual({
      ids: [],
      urls: [url],
      invalid: [],
    });
  });

  it("mixes IDs and a URL and reports invalid tokens", () => {
    const url =
      "https://www.curseforge.com/ark-survival-ascended/mods/cryopods";
    const parsed = parseModAddInput(`928793, not-a-mod, ${url}, abc`);
    expect(parsed.ids).toEqual(["928793"]);
    expect(parsed.urls).toEqual([url]);
    expect(parsed.invalid).toEqual([
      {
        raw: "not-a-mod",
        reason: "Not a numeric CurseForge Project ID or ASA mod URL.",
      },
      {
        raw: "abc",
        reason: "Not a numeric CurseForge Project ID or ASA mod URL.",
      },
    ]);
  });

  it("formats invalid tokens for UI errors", () => {
    expect(
      formatInvalidModAddTokens([
        { raw: "x", reason: "bad" },
      ]),
    ).toBe('"x" (bad)');
  });

  it("detects numeric project IDs", () => {
    expect(isCurseForgeProjectId("123")).toBe(true);
    expect(isCurseForgeProjectId("abc")).toBe(false);
  });
});

describe("prepareModAddApply", () => {
  it("resolves IDs and URLs then persists", async () => {
    const outcome = await prepareModAddApply(
      "929420",
      { configuredIds: [], disabledIds: [], cache: {} },
      async () => ({ ok: true, data: sampleDetail }),
    );
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") return;
    expect(outcome.next.configuredIds).toEqual(["929420"]);
    expect(outcome.next.cache["929420"]).toEqual(sampleDetail);
    expect(outcome.clearInput).toBe(true);
  });

  it("reports validation error when nothing is valid", async () => {
    const outcome = await prepareModAddApply(
      "nope",
      { configuredIds: [], disabledIds: [], cache: {} },
      async () => ({ ok: false, error: "fail" }),
    );
    expect(outcome.status).toBe("validation-error");
  });

  it("re-enables a configured mod that was disabled", async () => {
    const outcome = await prepareModAddApply(
      "929420",
      {
        configuredIds: ["929420"],
        disabledIds: ["929420"],
        cache: { "929420": sampleDetail },
      },
      async () => ({ ok: true, data: sampleDetail }),
    );
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") return;
    expect(outcome.next.configuredIds).toEqual(["929420"]);
    expect(outcome.next.disabledIds).toEqual([]);
  });
});
