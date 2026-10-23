import { describe, expect, it } from "vitest";
import { applyIniSemanticOps } from "@shared/ini/ini-semantic-ops";
import {
  IniComplexEditError,
  applyIniComplexEdits,
  parseIniComplexEntries,
  printIniComplexNode,
  type IniComplexDiagnostic,
  type IniComplexDiagnosticCode,
  type IniComplexField,
  type IniComplexNode,
  type IniComplexParseStatus,
  type IniComplexScalar,
  type IniComplexTuple,
  type IniSourceRange,
} from "@shared/ini/ini-complex-value";
import type { ServerIniPayload } from "@shared/types";

function entryAt(text: string, occurrence = 0) {
  const entries = parseIniComplexEntries(text, "game");
  const found = entries.find((entry) => entry.occurrence === occurrence);
  expect(found).toBeDefined();
  return found!;
}

describe("parseIniComplexEntries", () => {
  it("exposes raw text, source range, section, key, occurrence, value, status, and diagnostics", () => {
    const text = "[ServerSettings]\nXPMultiplier=1\nConfigAdd=plain\nConfigAdd=(A=1)\nConfigAdd=(B=2)\n";
    const entries = parseIniComplexEntries(text, "game");
    expect(entries).toHaveLength(2);
    const first = entries[0]!;
    const status: IniComplexParseStatus = first.status;
    const range: IniSourceRange = first.range;
    const diagnostics: readonly IniComplexDiagnostic[] = first.diagnostics;
    const codes: IniComplexDiagnosticCode[] = diagnostics.map((item) => item.code);
    const scalar: IniComplexScalar = { kind: "scalar", literal: "number", value: "1" };
    const field: IniComplexField = { name: "A", value: scalar };
    const parsed: IniComplexTuple = { kind: "tuple", fields: [field] };
    expect(first.fileKey).toBe("game");
    expect(first.section).toBe("ServerSettings");
    expect(first.key).toBe("ConfigAdd");
    expect(first.occurrence).toBe(1);
    expect(status).toBe("supported");
    expect(first.raw).toBe("(A=1)");
    expect(text.slice(range.start, range.end)).toBe(first.raw);
    expect(first.value).toEqual(parsed);
    expect(codes).toEqual([]);
    expect(entries[1]?.occurrence).toBe(2);
  });

  it("counts occurrence with the scalar parser, including case-insensitive section and key", () => {
    const text = "[Foo]\nK=(A=1)\n[foo]\nk=(B=2)\n";
    const entries = parseIniComplexEntries(text, "gameUserSettings");
    expect(entries.map((entry) => ({ section: entry.section, key: entry.key, occurrence: entry.occurrence }))).toEqual([
      { section: "Foo", key: "K", occurrence: 0 },
      { section: "foo", key: "k", occurrence: 1 },
    ]);
  });

  it("decodes escaped strings and nested tuples", () => {
    const text =
      '[Mod.Awesome]\nConfigOverrideItemCraftingCosts=(ItemClassString="say \\"hi\\"",BaseCraftingResourceRequirements=((ResourceItemTypeString="C:\\\\Mods",BaseResourceRequirement=1.0,bCraftingRequireExactResourceType=True)))\n';
    const entry = entryAt(text);
    expect(entry.status).toBe("supported");
    expect(entry.section).toBe("Mod.Awesome");
    expect(entry.value).toEqual({
      kind: "tuple",
      fields: [
        { name: "ItemClassString", value: { kind: "scalar", literal: "string", value: 'say "hi"' } },
        {
          name: "BaseCraftingResourceRequirements",
          value: {
            kind: "tuple",
            fields: [
              {
                name: null,
                value: {
                  kind: "tuple",
                  fields: [
                    {
                      name: "ResourceItemTypeString",
                      value: { kind: "scalar", literal: "string", value: "C:\\Mods" },
                    },
                    { name: "BaseResourceRequirement", value: { kind: "scalar", literal: "number", value: "1.0" } },
                    {
                      name: "bCraftingRequireExactResourceType",
                      value: { kind: "scalar", literal: "boolean", value: "true" },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    });
  });

  it("keeps duplicate field names in order", () => {
    const entry = entryAt("[S]\nK=(A=1,A=2)\n");
    expect(entry.value).toEqual({
      kind: "tuple",
      fields: [
        { name: "A", value: { kind: "scalar", literal: "number", value: "1" } },
        { name: "A", value: { kind: "scalar", literal: "number", value: "2" } },
      ],
    });
  });

  it("parses an empty tuple and a positional list", () => {
    expect(entryAt("[S]\nK=()\n").value).toEqual({ kind: "tuple", fields: [] });
    expect(entryAt('[S]\nK=("Raptor_Character_BP_C",1.0)\n').value).toEqual({
      kind: "tuple",
      fields: [
        { name: null, value: { kind: "scalar", literal: "string", value: "Raptor_Character_BP_C" } },
        { name: null, value: { kind: "scalar", literal: "number", value: "1.0" } },
      ],
    });
  });

  it("marks mixed named and positional fields ambiguous and does not guess a value", () => {
    const text = "[S]\nK=(A=1,2)\nInner=(Outer=(A=1,2))\n";
    const [mixed, inner] = parseIniComplexEntries(text, "game");
    expect(mixed?.status).toBe("ambiguous");
    expect(mixed?.value).toBeNull();
    expect(mixed?.diagnostics[0]?.code).toBe("mixed-fields");
    expect(inner?.status).toBe("ambiguous");
    expect(inner?.value).toBeNull();
  });

  it("marks a balanced shape outside the grammar unknown", () => {
    const entry = entryAt("[S]\nK=(hello world)\n");
    expect(entry.status).toBe("unknown");
    expect(entry.value).toBeNull();
    expect(entry.raw).toBe("(hello world)");
    expect(entry.diagnostics[0]?.code).toBe("unsupported-structure");
  });

  it("marks unclosed tuples, unclosed strings, and unknown escapes invalid", () => {
    expect(entryAt("[S]\nK=(A=1\n").diagnostics[0]?.code).toBe("unclosed-tuple");
    expect(entryAt('[S]\nK=(A="hi ; there\n').raw).toBe('(A="hi ; there');
    expect(entryAt('[S]\nK=(A="hi\n').diagnostics[0]?.code).toBe("unclosed-string");
    const escaped = entryAt('[S]\nK=(A="\\q") ; keep\n');
    expect(escaped.status).toBe("invalid");
    expect(escaped.diagnostics[0]?.code).toBe("bad-escape");
    expect(escaped.raw).toBe('(A="\\q")');
  });

  it("marks extra trailing text unknown and keeps an inline comment outside the raw span", () => {
    const junk = entryAt("[S]\nK=(A=1) leftover\n");
    expect(junk.status).toBe("unknown");
    expect(junk.diagnostics[0]?.code).toBe("trailing-content");
    expect(junk.raw).toBe("(A=1) leftover");

    const commented = entryAt("[S]\nK=(A=1) ; keep\n");
    expect(commented.status).toBe("supported");
    expect(commented.raw).toBe("(A=1)");
  });

  it("does not treat scalars, comments, or object paths as complex entries", () => {
    const text = `[S]
; K=(A=1)
# K=(A=1)
Plain=5
Path=Blueprint'/Game/Foo(bar).Foo'
`;
    expect(parseIniComplexEntries(text, "game")).toEqual([]);
  });
});

describe("applyIniComplexEdits", () => {
  const samples = ["\r\n", "\n"];

  it.each(samples)("returns the same text when nothing is adopted (%j)", (eol) => {
    const text = `; comment${eol}[Mod.Section]${eol}${eol}# disabled${eol}Keep=1${eol}Target=( A = 1, )${eol}Weird=(hello world)${eol}Broken=(A=${eol}`;
    expect(applyIniComplexEdits(text, "game", [])).toBe(text);
    parseIniComplexEntries(text, "game");
    expect(text).toBe(text);
  });

  it("regenerates only the adopted entry", () => {
    const text =
      "[/Script/ShooterGame.ShooterGameMode]\r\nGood=(A=1) ; keep\r\nBad=(A=\r\nOther=(B=2)\r\nWeird=(hello world)\r\nScalar=5\r\n";
    const next = applyIniComplexEdits(text, "game", [
      {
        section: " /Script/ShooterGame.ShooterGameMode ".trim(),
        key: "Good",
        occurrence: 0,
        value: {
          kind: "tuple",
          fields: [{ name: "A", value: { kind: "scalar", literal: "number", value: "2" } }],
        },
      },
    ]);
    expect(next).toBe(
      "[/Script/ShooterGame.ShooterGameMode]\r\nGood=(A=2) ; keep\r\nBad=(A=\r\nOther=(B=2)\r\nWeird=(hello world)\r\nScalar=5\r\n",
    );
  });

  it("adopts an unclosed line and leaves the inline comment in place", () => {
    const text = "[S]\nK=(A=1 ; keep\nNext=(B=2) # also\n";
    expect(entryAt(text).raw).toBe("(A=1");
    expect(entryAt(text, 0).status).toBe("invalid");
    const next = applyIniComplexEdits(text, "game", [
      {
        section: "S",
        key: "K",
        occurrence: 0,
        value: {
          kind: "tuple",
          fields: [{ name: "A", value: { kind: "scalar", literal: "number", value: "2" } }],
        },
      },
    ]);
    expect(next).toBe("[S]\nK=(A=2) ; keep\nNext=(B=2) # also\n");
  });

  it("edits a section whose header keeps surrounding spaces", () => {
    const text = "[ Foo ]\nK=(A=1)\n";
    const next = applyIniComplexEdits(text, "game", [
      {
        section: " Foo ",
        key: "K",
        occurrence: 0,
        value: { kind: "tuple", fields: [] },
      },
    ]);
    expect(next).toBe("[ Foo ]\nK=()\n");
  });

  it("rejects a blank identity or a non-integer occurrence before lookup", () => {
    const text = "[S]\nK=(A=1)\n";
    const value: IniComplexNode = { kind: "tuple", fields: [] };
    for (const edit of [
      { section: " ", key: "K", occurrence: 0, value },
      { section: "S", key: " ", occurrence: 0, value },
      { section: "S", key: "K", occurrence: -1, value },
      { section: "S", key: "K", occurrence: 1.5, value },
      { section: "S", key: "K", occurrence: Number.NaN, value },
    ]) {
      try {
        applyIniComplexEdits(text, "game", [edit]);
        expect.fail("expected invalid edit");
      } catch (err) {
        expect(err).toBeInstanceOf(IniComplexEditError);
        expect((err as IniComplexEditError).code).toBe("INI_COMPLEX_EDIT_INVALID");
      }
    }
    expect(text).toBe("[S]\nK=(A=1)\n");
  });

  it("adopts an unknown line without rewriting its neighbors", () => {
    const text = "[S]\nKnown=(A=1)\nWeird=(hello world)\n";
    const next = applyIniComplexEdits(text, "game", [
      {
        section: "s",
        key: "WEIRD",
        occurrence: 0,
        value: { kind: "tuple", fields: [] },
      },
    ]);
    expect(next).toBe("[S]\nKnown=(A=1)\nWeird=()\n");
  });

  it("canonicalizes only the adopted entry when the operator accepts the parsed value", () => {
    const text = "[S]\nK=( A = 1, )\nOther=(B=2)\n";
    const parsed = entryAt(text).value;
    expect(parsed).not.toBeNull();
    const next = applyIniComplexEdits(text, "game", [{ section: "S", key: "K", occurrence: 0, value: parsed! }]);
    expect(next).toBe("[S]\nK=(A=1)\nOther=(B=2)\n");
  });

  it("edits one duplicate and leaves the other copies", () => {
    const text = "[Mode]\nK=(A=1)\nK=(A=2)\n[Mode]\nK=(A=3)\n";
    const next = applyIniComplexEdits(text, "game", [
      {
        section: "mode",
        key: "k",
        occurrence: 1,
        value: {
          kind: "tuple",
          fields: [{ name: "A", value: { kind: "scalar", literal: "number", value: "9" } }],
        },
      },
    ]);
    expect(next).toBe("[Mode]\nK=(A=1)\nK=(A=9)\n[Mode]\nK=(A=3)\n");
  });

  it("refuses a missing target, a duplicate edit, or a mixed value without writing", () => {
    const text = "[S]\nK=(A=1)\n";
    expect(() => applyIniComplexEdits(text, "game", [])).not.toThrow();
    expect(() =>
      applyIniComplexEdits(text, "game", [
        { section: "S", key: "Missing", occurrence: 0, value: { kind: "tuple", fields: [] } },
      ]),
    ).toThrow(IniComplexEditError);
    try {
      applyIniComplexEdits(text, "game", [
        { section: "S", key: "K", occurrence: 0, value: { kind: "tuple", fields: [] } },
        { section: "S", key: "K", occurrence: 0, value: { kind: "tuple", fields: [] } },
      ]);
      expect.fail("expected duplicate edit");
    } catch (err) {
      expect(err).toBeInstanceOf(IniComplexEditError);
      expect((err as IniComplexEditError).code).toBe("INI_COMPLEX_EDIT_DUPLICATE");
    }
    const mixed: IniComplexNode = {
      kind: "tuple",
      fields: [
        { name: "A", value: { kind: "scalar", literal: "number", value: "1" } },
        { name: null, value: { kind: "scalar", literal: "number", value: "2" } },
      ],
    };
    expect(() => applyIniComplexEdits(text, "game", [{ section: "S", key: "K", occurrence: 0, value: mixed }])).toThrow(
      IniComplexEditError,
    );
    expect(text).toBe("[S]\nK=(A=1)\n");
  });
});

describe("printIniComplexNode", () => {
  it("round-trips a supported tree through print and parse", () => {
    const node: IniComplexNode = {
      kind: "tuple",
      fields: [
        { name: "Name", value: { kind: "scalar", literal: "string", value: 'say "hi"\n' } },
        { name: "Flag", value: { kind: "scalar", literal: "boolean", value: "false" } },
        {
          name: "Items",
          value: {
            kind: "tuple",
            fields: [{ name: null, value: { kind: "scalar", literal: "token", value: "Raptor_Character_BP_C" } }],
          },
        },
      ],
    };
    const text = `[S]\nK=${printIniComplexNode(node)}\n`;
    expect(entryAt(text).value).toEqual(node);
  });
});

describe("complex value corpus", () => {
  it("keeps random supported files byte-identical until an edit", () => {
    const rng = mulberry32(680);
    for (let index = 0; index < 40; index += 1) {
      const node = randomTuple(rng, 0);
      const eol = index % 2 === 0 ? "\r\n" : "\n";
      const printed = printIniComplexNode(node);
      const text = `; note${eol}[ModNS.Section]${eol}${eol}Keep=${index}${eol}Target=${printed} ; tail${eol}`;
      expect(applyIniComplexEdits(text, "game", [])).toBe(text);
      const entry = entryAt(text);
      expect(entry.status).toBe("supported");
      expect(entry.value).toEqual(node);
      expect(entry.diagnostics).toEqual([]);
      const next = applyIniComplexEdits(text, "game", [
        {
          section: "ModNS.Section",
          key: "Target",
          occurrence: 0,
          value: { kind: "tuple", fields: [] },
        },
      ]);
      expect(next.startsWith(`; note${eol}[ModNS.Section]${eol}${eol}Keep=${index}${eol}Target=`)).toBe(true);
      expect(next.endsWith(`() ; tail${eol}`)).toBe(true);
      expect(next).not.toBe(text);
    }
  });
});

describe("scalar semantic Save", () => {
  it("preserves an unrelated complex line byte-for-byte", () => {
    const complex =
      'ConfigOverrideItemCraftingCosts=(ItemClassString="Metal",BaseCraftingResourceRequirements=((ResourceItemTypeString="Ingot",BaseResourceRequirement=1.0)))';
    const disk: ServerIniPayload = {
      gameUserSettings: `[ServerSettings]\r\nXPMultiplier=1\r\n${complex}\r\n`,
      game: "",
    };
    const next = applyIniSemanticOps(disk, [
      {
        kind: "set",
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "XPMultiplier",
        occurrence: 0,
        expectedPreviousValue: "1",
        nextValue: "3",
      },
    ]);
    expect(next.gameUserSettings).toBe(`[ServerSettings]\r\nXPMultiplier=3\r\n${complex}\r\n`);
  });
});

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomTuple(rng: () => number, depth: number): IniComplexNode {
  const named = rng() < 0.5;
  const count = 1 + Math.floor(rng() * 3);
  const fields = Array.from({ length: count }, (_, index) => ({
    name: named ? (["Alpha", "ItemClassString", "bFlag", "SpawnWeight"][index] ?? "Extra") : null,
    value: depth === 0 && rng() < 0.7 ? randomTuple(rng, depth + 1) : randomScalar(rng),
  }));
  return { kind: "tuple", fields };
}

function randomScalar(rng: () => number): IniComplexNode {
  const roll = rng();
  if (roll < 0.25) {
    const alphabet = 'ab "\\,()=\n\t';
    const length = Math.floor(rng() * 8);
    let value = "";
    for (let index = 0; index < length; index += 1) {
      value += alphabet[Math.floor(rng() * alphabet.length)] ?? "a";
    }
    return { kind: "scalar", literal: "string", value };
  }
  if (roll < 0.5) {
    const value = ["0", "1", "1.0", "-2", "0.5", "1e-2"][Math.floor(rng() * 6)] ?? "1";
    return { kind: "scalar", literal: "number", value };
  }
  if (roll < 0.75) {
    return { kind: "scalar", literal: "boolean", value: rng() < 0.5 ? "true" : "false" };
  }
  const value =
    ["Raptor_Character_BP_C", "PrimalItem_C", "Blueprint'/Game/Foo.Foo'"][Math.floor(rng() * 3)] ?? "Item_C";
  return { kind: "scalar", literal: "token", value };
}
