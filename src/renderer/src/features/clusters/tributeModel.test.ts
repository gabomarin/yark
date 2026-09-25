import { describe, expect, it } from "vitest";
import { defaultClusterWideValues, readTributeValues, summarizeClusterWideValues, validateClusterWideValues } from "./tributeModel";

describe("cluster tribute settings model", () => {
  it("uses catalog defaults only to seed the editable form when a key is missing", () => {
    expect(defaultClusterWideValues()).toEqual({
      TributeItemExpirationSeconds: 86400,
      TributeDinoExpirationSeconds: 86400,
      TributeCharacterExpirationSeconds: 0,
      MaxTributeItems: 50,
      MaxTributeDinos: 20,
      MaxTributeCharacters: 10,
    });
    expect(readTributeValues("[ServerSettings]\nMaxTributeItems=64\n").MaxTributeItems).toBe("64");
    expect(readTributeValues("").MaxTributeItems).toBeNull();
  });

  it("reports missing and different settings without folding per-map keys into drift", () => {
    expect(
      summarizeClusterWideValues([
        { TributeItemExpirationSeconds: "86400", MaxTributeItems: "50" },
        { TributeItemExpirationSeconds: "172800", MaxTributeItems: "50" },
      ]),
    ).toMatchObject({
      TributeItemExpirationSeconds: "different",
      TributeDinoExpirationSeconds: "missing",
      MaxTributeItems: "matching",
    });
  });

  it("rejects invalid durations and slot values below the catalog defaults", () => {
    const defaults = defaultClusterWideValues();
    expect(validateClusterWideValues({ ...defaults, TributeItemExpirationSeconds: 31_536_001 })).toMatch(
      /one year/i,
    );
    expect(validateClusterWideValues({ ...defaults, TributeItemExpirationSeconds: 31_536_000 })).toBeNull();
    expect(validateClusterWideValues({ ...defaults, MaxTributeDinos: 19 })).toMatch(/default of 20/i);
    expect(validateClusterWideValues({ ...defaults, MaxTributeItems: 1.5 })).toMatch(/whole number/i);
    expect(validateClusterWideValues(defaults)).toBeNull();
  });
});
