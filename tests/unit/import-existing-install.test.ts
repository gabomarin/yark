import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  classifyImportContinue,
  assertImportHealthAllowed,
  isImportIncompleteEligible,
  shouldBuildImportSuggestions,
  collectModProjectIdsFromTree,
  discoverAsaModProjectIds,
  extractModIdsFromText,
  buildImportSuggestions,
  findManagedInstallClash,
  mapTokenFromWorldSaveName,
  resolveNestedAsaInstallRoot,
  suggestMapFromSavedArks,
} from "../../src/backend/domains/instances/import-existing-install";

describe("import-existing-install", () => {
  let root: string | null = null;

  afterEach(async () => {
    if (root !== null) {
      await rm(root, { recursive: true, force: true });
      root = null;
    }
  });

  async function tempRoot(): Promise<string> {
    root = await mkdtemp(join(tmpdir(), "yark-import-"));
    return root;
  }

  it("collects unique project IDs from Mods/83374 child dirs", async () => {
    const dir = join(await tempRoot(), "83374");
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, "928837_111"));
    await mkdir(join(dir, "940123_222"));
    await mkdir(join(dir, "928837_333")); // same project, different file
    await mkdir(join(dir, "not_a_mod"));
    await writeFile(join(dir, "readme.txt"), "x");

    const ids = await collectModProjectIdsFromTree(dir);
    expect(ids).toEqual(["928837", "940123"]);
  });

  it("discovers primary Win64 nested Mods tree and merges secondary", async () => {
    const install = join(await tempRoot(), "TheIsland");
    const primary = join(
      install,
      "ShooterGame",
      "Binaries",
      "Win64",
      "ShooterGame",
      "Mods",
      "83374",
    );
    const secondary = join(install, "ShooterGame", "Mods", "83374");
    await mkdir(join(primary, "111_1"), { recursive: true });
    await mkdir(join(secondary, "222_9"), { recursive: true });
    await mkdir(join(secondary, "111_2"), { recursive: true });

    const ids = await discoverAsaModProjectIds(install);
    expect(ids).toEqual(["111", "222"]);
  });

  it("returns empty mods when Mods tree is missing", async () => {
    const install = join(await tempRoot(), "Empty");
    await mkdir(install, { recursive: true });
    expect(await discoverAsaModProjectIds(install)).toEqual([]);
  });

  it("extracts -mods= leftovers from text", () => {
    expect(extractModIdsFromText('foo -mods=10,20,10 bar')).toEqual(["10", "20"]);
  });

  it("prefills suggestions from GameUserSettings.ini", async () => {
    const install = join(await tempRoot(), "MyServer");
    const gusDir = join(
      install,
      "ShooterGame",
      "Saved",
      "Config",
      "WindowsServer",
    );
    await mkdir(gusDir, { recursive: true });
    await writeFile(
      join(gusDir, "GameUserSettings.ini"),
      `[SessionSettings]
SessionName=Island Official
Port=7778
QueryPort=27016

[ServerSettings]
RCONPort=27021
ServerAdminPassword=secret
ServerPassword=joinme
`,
      "utf8",
    );

    const suggestions = await buildImportSuggestions(install);
    expect(suggestions.name).toBe("MyServer");
    expect(suggestions.sessionName).toBe("Island Official");
    expect(suggestions.gamePort).toBe(7778);
    expect(suggestions.queryPort).toBe(27016);
    expect(suggestions.rconPort).toBe(27021);
    expect(suggestions.adminPassword).toBe("secret");
    expect(suggestions.serverPassword).toBe("joinme");
  });

  it("leaves admin password empty when GUS has none", async () => {
    const install = join(await tempRoot(), "NoAdmin");
    await mkdir(install, { recursive: true });
    const suggestions = await buildImportSuggestions(install);
    expect(suggestions.adminPassword).toBe("");
  });

  it("classifies continue gates by health", () => {
    expect(classifyImportContinue("ready")).toEqual({
      canContinue: true,
    });
    expect(classifyImportContinue("suspicious")).toEqual({
      canContinue: false,
    });
    expect(classifyImportContinue("incomplete")).toEqual({
      canContinue: false,
    });
    expect(classifyImportContinue("missing")).toEqual({
      canContinue: false,
    });
    expect(classifyImportContinue("empty")).toEqual({
      canContinue: false,
    });
  });

  it("allows incomplete import only with explicit opt-in", () => {
    expect(() => assertImportHealthAllowed("ready")).not.toThrow();
    expect(() =>
      assertImportHealthAllowed("incomplete", { allowIncompleteInstall: true }),
    ).not.toThrow();
    expect(() => assertImportHealthAllowed("incomplete")).toThrow(/incomplete/i);
    expect(() =>
      assertImportHealthAllowed("incomplete", { allowIncompleteInstall: false }),
    ).toThrow(/incomplete/i);
    expect(() =>
      assertImportHealthAllowed("empty", { allowIncompleteInstall: true }),
    ).toThrow(/ready ASA/i);
    expect(() =>
      assertImportHealthAllowed("missing", { allowIncompleteInstall: true }),
    ).toThrow(/ready ASA/i);
    expect(() =>
      assertImportHealthAllowed("suspicious", { allowIncompleteInstall: true }),
    ).toThrow(/ready ASA/i);
  });

  it("builds suggestions for ready and incomplete only", () => {
    expect(shouldBuildImportSuggestions("ready")).toBe(true);
    expect(shouldBuildImportSuggestions("incomplete")).toBe(true);
    expect(shouldBuildImportSuggestions("empty")).toBe(false);
    expect(shouldBuildImportSuggestions("missing")).toBe(false);
    expect(isImportIncompleteEligible("incomplete")).toBe(true);
    expect(isImportIncompleteEligible("empty")).toBe(false);
  });

  it("detects nested paths under ShooterGame and suggests the dedicated root", () => {
    expect(
      resolveNestedAsaInstallRoot(
        "C:\\ASA server\\lost_colony\\LostColony\\ShooterGame\\Binaries\\Win64",
      ),
    ).toEqual({
      nestedSubfolder: true,
      suggestedInstallDir: "C:\\ASA server\\lost_colony\\LostColony",
    });
    expect(
      resolveNestedAsaInstallRoot(
        "C:\\ASA server\\lost_colony\\LostColony\\ShooterGame",
      ),
    ).toEqual({
      nestedSubfolder: true,
      suggestedInstallDir: "C:\\ASA server\\lost_colony\\LostColony",
    });
    expect(
      resolveNestedAsaInstallRoot("C:\\ASA server\\lost_colony\\LostColony"),
    ).toEqual({
      nestedSubfolder: false,
      suggestedInstallDir: null,
    });
  });

  it("parses map tokens from world save filenames", () => {
    expect(mapTokenFromWorldSaveName("LostColony_WP.ark")).toBe("LostColony_WP");
    expect(
      mapTokenFromWorldSaveName("LostColony_WP_24.07.2025_21.51.53.ark"),
    ).toBe("LostColony_WP");
    expect(mapTokenFromWorldSaveName("player.arkprofile")).toBeNull();
    expect(mapTokenFromWorldSaveName("tribe.arktribe")).toBeNull();
  });

  it("suggests map from the newest SavedArks world .ark by mtime", async () => {
    const install = join(await tempRoot(), "MapPick");
    const savedArks = join(install, "ShooterGame", "Saved", "SavedArks");
    await mkdir(savedArks, { recursive: true });
    const older = join(savedArks, "TheIsland_WP.ark");
    const newer = join(savedArks, "LostColony_WP.ark");
    await writeFile(older, "old");
    await writeFile(newer, "new");
    const { utimes } = await import("node:fs/promises");
    const oldTime = new Date("2024-01-01T00:00:00Z");
    const newTime = new Date("2025-06-01T00:00:00Z");
    await utimes(older, oldTime, oldTime);
    await utimes(newer, newTime, newTime);

    expect(await suggestMapFromSavedArks(install)).toBe("LostColony_WP");

    const suggestions = await buildImportSuggestions(install);
    expect(suggestions.map).toBe("LostColony_WP");
  });

  it("suggests map from nested mod folders that are not MapToken-shaped", async () => {
    const install = join(await tempRoot(), "NestedModMap");
    const savedArks = join(install, "ShooterGame", "Saved", "SavedArks");
    const nested = join(savedArks, "Svartalfheim");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "Svartalfheim_WP.ark"), "svart");

    expect(await suggestMapFromSavedArks(install)).toBe("Svartalfheim_WP");
  });

  it("detects install dirs already managed by YARK", () => {
    const clash = findManagedInstallClash("D:\\Servers\\Island", [
      { name: "Island", installDir: "d:/Servers/Island/" },
    ]);
    expect(clash?.name).toBe("Island");
    expect(
      findManagedInstallClash("D:\\Servers\\Other", [
        { name: "Island", installDir: "D:\\Servers\\Island" },
      ]),
    ).toBeNull();
  });
});
