import { describe, expect, it } from "vitest";
import {
  canonicalCurseForgeAsaModUrl,
  curseForgeAsaSlugFromUrl,
  getCurseForgeAsaModUrlError,
} from "@shared/mods/curseforge-url";

describe("CurseForge ASA mod URLs", () => {
  it("accepts and canonicalizes a mod detail URL", () => {
    const input = "https://curseforge.com/ark-survival-ascended/mods/awesomespyglass/";
    expect(getCurseForgeAsaModUrlError(input)).toBeNull();
    expect(curseForgeAsaSlugFromUrl(input)).toBe("awesomespyglass");
    expect(canonicalCurseForgeAsaModUrl(input)).toBe(
      "https://www.curseforge.com/ark-survival-ascended/mods/awesomespyglass",
    );
  });

  it("accepts an ASA slug that contains underscores (#692)", () => {
    const input = "https://www.curseforge.com/ark-survival-ascended/mods/speed_costumes";
    expect(getCurseForgeAsaModUrlError(input)).toBeNull();
    expect(curseForgeAsaSlugFromUrl(input)).toBe("speed_costumes");
    expect(canonicalCurseForgeAsaModUrl(input)).toBe(input);
  });

  it("accepts a tab or file link and keeps the project slug (#692)", () => {
    const files = "https://www.curseforge.com/ark-survival-ascended/mods/speed_costumes/files/123";
    const relations = "https://www.curseforge.com/ark-survival-ascended/mods/speed_costumes/relations/dependencies";
    expect(getCurseForgeAsaModUrlError(files)).toBeNull();
    expect(curseForgeAsaSlugFromUrl(files)).toBe("speed_costumes");
    expect(canonicalCurseForgeAsaModUrl(files)).toBe(
      "https://www.curseforge.com/ark-survival-ascended/mods/speed_costumes",
    );
    expect(curseForgeAsaSlugFromUrl(relations)).toBe("speed_costumes");
  });

  it.each([
    ["", "Enter a CurseForge mod URL."],
    ["not-a-url", "Enter a valid URL, including https://."],
    ["http://curseforge.com/ark-survival-ascended/mods/test", "must use https"],
    ["https://example.com/ark-survival-ascended/mods/test", "curseforge.com"],
    ["https://curseforge.com/minecraft/mc-mods/test", "Ark: Survival Ascended"],
    ["https://www.curseforge.com/ark-survival-evolved/mods/speed_costumes", "Ark: Survival Ascended"],
    [
      "https://www.curseforge.com/ark-survival-ascended/mods/speed_costumes/../../minecraft/mc-mods/jei",
      "Ark: Survival Ascended",
    ],
  ])("rejects %j", (input, expected) => {
    expect(getCurseForgeAsaModUrlError(input)).toContain(expected);
  });
});
