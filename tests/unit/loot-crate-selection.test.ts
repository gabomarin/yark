import { describe, expect, it } from "vitest";
import { keepSupplyCrateSelection } from "@shared/ini/loot-crate-selection";

function row(occurrence: number, className: string): { section: string; occurrence: number; className: string } {
  return { section: "ShooterGameMode", occurrence, className };
}

describe("keepSupplyCrateSelection", () => {
  it("keeps the same line after the file is rewritten", () => {
    const key = "ShooterGameMode\u001f0";
    expect(
      keepSupplyCrateSelection(key, [], { [key]: { className: "SupplyCrate_Level03_C" } }, [
        row(0, "SupplyCrate_Level03_C"),
      ]),
    ).toBe(key);
  });

  it("opens the saved line for a crate that was only pending", () => {
    const rows = [row(0, "SupplyCrate_Level03_C"), row(1, "SupplyCrate_Level15_C")];
    expect(
      keepSupplyCrateSelection(
        "pending",
        [{ id: "pending", body: { className: "SupplyCrate_Level15_C" } }],
        {
          "ShooterGameMode\u001f0": { className: "SupplyCrate_Level03_C" },
        },
        rows,
      ),
    ).toBe("ShooterGameMode\u001f1");
  });

  it("opens the first saved duplicate when that pending crate was first", () => {
    const rows = [row(0, "SupplyCrate_Level03_C"), row(1, "SupplyCrate_Level03_C")];
    expect(
      keepSupplyCrateSelection(
        "first",
        [
          { id: "first", body: { className: "SupplyCrate_Level03_C" } },
          { id: "second", body: { className: "SupplyCrate_Level03_C" } },
        ],
        {},
        rows,
      ),
    ).toBe("ShooterGameMode\u001f0");
  });
  it("clears the selection when that crate is gone", () => {
    expect(keepSupplyCrateSelection("missing", [], {}, [row(0, "SupplyCrate_Level03_C")])).toBeNull();
    expect(keepSupplyCrateSelection(null, [], {}, [])).toBeNull();
  });
});
