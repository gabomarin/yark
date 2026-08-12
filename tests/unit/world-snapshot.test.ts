import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectWorldBackupCandidates,
  copySavedArksFiles,
  isAntiCorruptionWorldSaveName,
  isDatedWorldAutosaveName,
  isEssentialWorldSaveName,
  isPrimaryWorldSaveName,
  isSelectableWorldBackupFileName,
  isTransientWorldSaveName,
  isWorldProfileOrTribeName,
  missingEssentialWorldRels,
  resolveWorldMapSaveDir,
  selectWorldBackupSourceFiles,
  worldMapDirNameCandidates,
} from "@backend/domains/backups/world-snapshot";

describe("world-snapshot helpers", () => {
  it("classifies transient, primary, dated, companions, and essentials", () => {
    expect(isTransientWorldSaveName("Genesis_WP_28.07.2026_06.53.34.arkrbf")).toBe(
      true,
    );
    expect(isTransientWorldSaveName("scratch.tmp")).toBe(true);
    expect(isTransientWorldSaveName("Genesis_WP.ark")).toBe(false);
    expect(isPrimaryWorldSaveName("Genesis_WP.ark")).toBe(true);
    expect(isDatedWorldAutosaveName("Genesis_WP.ark")).toBe(false);
    expect(
      isDatedWorldAutosaveName("Genesis_WP_28.07.2026_06.53.34.ark"),
    ).toBe(true);
    expect(isEssentialWorldSaveName("Genesis_WP.ark")).toBe(true);
    expect(
      isEssentialWorldSaveName("Genesis_WP_28.07.2026_06.53.34.ark"),
    ).toBe(false);
    expect(isWorldProfileOrTribeName("Tribe.arktribe")).toBe(true);
    expect(isWorldProfileOrTribeName("765.arkprofile")).toBe(true);
    expect(isWorldProfileOrTribeName("Tribe.tribebak")).toBe(true);
    expect(isAntiCorruptionWorldSaveName("Genesis_WP.ark.bak", "Genesis_WP")).toBe(
      true,
    );
    expect(
      isAntiCorruptionWorldSaveName("Genesis_WP_AntiCorruptionBackup.bak", "Genesis_WP"),
    ).toBe(true);
    expect(isEssentialWorldSaveName("Genesis_WP.arkrbf")).toBe(false);
    expect(isSelectableWorldBackupFileName("Genesis_WP.ark", "Genesis_WP")).toBe(true);
    expect(
      isSelectableWorldBackupFileName("Genesis_WP_28.07.2026_06.53.34.ark", "Genesis_WP"),
    ).toBe(false);
    expect(isSelectableWorldBackupFileName("TheIsland_WP.ark", "Genesis_WP")).toBe(
      false,
    );
  });

  it("lists map folder name candidates without scanning sibling .ark files", () => {
    expect(worldMapDirNameCandidates("TheIsland_WP")).toEqual([
      "TheIsland_WP",
      "TheIsland",
    ]);
    expect(worldMapDirNameCandidates("Svartalfheim_WP")).toEqual([
      "Svartalfheim_WP",
      "Svartalfheim",
    ]);
    expect(worldMapDirNameCandidates("Ragnarok")).toEqual(["Ragnarok"]);
    expect(worldMapDirNameCandidates("Svartalfheim_WP", "Svartalfheim")).toEqual([
      "Svartalfheim",
      "Svartalfheim_WP",
    ]);
  });

  it("prefers mapSaveFolder override when resolving SavedArks dirs", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-map-override-"));
    try {
      const custom = join(root, "CustomSave");
      await mkdir(custom, { recursive: true });
      await writeFile(join(custom, "Svartalfheim_WP.ark"), "S", "utf8");
      const resolved = await resolveWorldMapSaveDir(
        root,
        "Svartalfheim_WP",
        "CustomSave",
      );
      expect(resolved).toEqual({ dir: custom, folderName: "CustomSave" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not fall back to auto folders when an explicit override is present", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-map-override-authoritative-"));
    try {
      const custom = join(root, "CustomSave");
      const automatic = join(root, "Svartalfheim_WP");
      await mkdir(custom, { recursive: true });
      await mkdir(automatic, { recursive: true });
      await writeFile(join(automatic, "Svartalfheim_WP.ark"), "STALE", "utf8");

      await expect(
        resolveWorldMapSaveDir(root, "Svartalfheim_WP", "CustomSave"),
      ).resolves.toEqual({ dir: custom, folderName: "CustomSave" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("resolves mod map folders by name (strip _WP), not by hunting .ark across maps", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-map-dir-"));
    try {
      const island = join(root, "TheIsland_WP");
      const svart = join(root, "Svartalfheim");
      await mkdir(island, { recursive: true });
      await mkdir(svart, { recursive: true });
      await writeFile(join(island, "TheIsland_WP.ark"), "I", "utf8");
      await writeFile(join(svart, "Svartalfheim_WP.ark"), "S", "utf8");
      // Rotation leftover: another map's .ark inside Svartalfheim must not redirect Island.
      await writeFile(join(svart, "TheIsland_WP.ark"), "LEFTOVER", "utf8");

      const islandResolved = await resolveWorldMapSaveDir(root, "TheIsland_WP");
      expect(islandResolved).toEqual({ dir: island, folderName: "TheIsland_WP" });

      const svartResolved = await resolveWorldMapSaveDir(root, "Svartalfheim_WP");
      expect(svartResolved).toEqual({ dir: svart, folderName: "Svartalfheim" });

      // Leftover Island .ark under Svartalfheim must not win for Island token.
      expect(islandResolved?.dir).not.toBe(svart);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("omits dated autosaves and keeps primary plus companions for one map", () => {
    const selection = selectWorldBackupSourceFiles(
      [
        { path: "C:\\a\\Genesis_WP.ark", name: "Genesis_WP.ark", mtimeMs: 100 },
        {
          path: "C:\\a\\Genesis_WP.ark.bak",
          name: "Genesis_WP.ark.bak",
          mtimeMs: 99,
        },
        {
          path: "C:\\a\\Genesis_WP_01.01.2026_01.00.00.ark",
          name: "Genesis_WP_01.01.2026_01.00.00.ark",
          mtimeMs: 10,
        },
        {
          path: "C:\\a\\Genesis_WP_04.01.2026_01.00.00.ark",
          name: "Genesis_WP_04.01.2026_01.00.00.ark",
          mtimeMs: 40,
        },
        {
          path: "C:\\a\\noise.arkrbf",
          name: "noise.arkrbf",
          mtimeMs: 99,
        },
        {
          path: "C:\\a\\player.arkprofile",
          name: "player.arkprofile",
          mtimeMs: 5,
        },
        {
          path: "C:\\a\\tribe.arktribe",
          name: "tribe.arktribe",
          mtimeMs: 6,
        },
      ],
      { mapToken: "Genesis_WP" },
    );

    const names = selection.selected.map((row) => row.name).sort();
    expect(names).toEqual([
      "Genesis_WP.ark",
      "Genesis_WP.ark.bak",
      "player.arkprofile",
      "tribe.arktribe",
    ]);
    expect(selection.skippedTransientCount).toBe(1);
    expect(selection.retainedDatedCount).toBe(0);
    expect(selection.skippedOlderDatedCount).toBe(2);
  });

  it("can retain dated autosaves when an explicit positive cap is passed", () => {
    const selection = selectWorldBackupSourceFiles(
      [
        { path: "C:\\a\\Genesis_WP.ark", name: "Genesis_WP.ark", mtimeMs: 100 },
        {
          path: "C:\\a\\Genesis_WP_01.01.2026_01.00.00.ark",
          name: "Genesis_WP_01.01.2026_01.00.00.ark",
          mtimeMs: 10,
        },
        {
          path: "C:\\a\\Genesis_WP_04.01.2026_01.00.00.ark",
          name: "Genesis_WP_04.01.2026_01.00.00.ark",
          mtimeMs: 40,
        },
      ],
      { mapToken: "Genesis_WP", maxDatedAutosavesPerMap: 1 },
    );
    expect(selection.selected.map((row) => row.name).sort()).toEqual([
      "Genesis_WP.ark",
      "Genesis_WP_04.01.2026_01.00.00.ark",
    ]);
    expect(selection.retainedDatedCount).toBe(1);
    expect(selection.skippedOlderDatedCount).toBe(1);
  });

  it("skips transient files that vanish between enumerate and stat", async () => {
    const candidates = await collectWorldBackupCandidates(
      ["C:\\a\\ok.ark", "C:\\a\\gone.arkrbf"],
      async (path) => {
        if (path.endsWith(".arkrbf")) {
          const error = Object.assign(new Error("missing"), { code: "ENOENT" });
          throw error;
        }
        return { mtimeMs: 1 };
      },
    );
    expect(candidates).toEqual([
      { path: "C:\\a\\ok.ark", name: "ok.ark", mtimeMs: 1 },
    ]);
  });

  it("copySavedArksFiles skips mid-copy transient ENOENT and fails essentials", async () => {
    const copyFile = vi.fn(async (src: string) => {
      if (src.endsWith(".arkrbf")) {
        throw Object.assign(new Error("gone"), { code: "ENOENT" });
      }
      if (src.endsWith("Genesis_WP.ark")) {
        throw Object.assign(new Error("gone"), { code: "ENOENT" });
      }
    });

    const soft = await copySavedArksFiles(
      "C:\\src",
      "C:\\dest",
      ["C:\\src\\noise.arkrbf"],
      copyFile,
    );
    expect(soft.copiedFileCount).toBe(0);
    expect(soft.skippedTransientCount).toBe(1);

    await expect(
      copySavedArksFiles(
        "C:\\src",
        "C:\\dest",
        ["C:\\src\\Genesis_WP.ark"],
        copyFile,
        { mapToken: "Genesis_WP" },
      ),
    ).rejects.toThrow(/Essential world save disappeared/);
  });

  it("missingEssentialWorldRels reports absent essentials by relative path", () => {
    const missing = missingEssentialWorldRels(
      "C:\\src",
      "C:\\dest",
      [join("C:\\src", "Genesis_WP.ark"), join("C:\\src", "player.arkprofile")],
      [join("C:\\dest", "player.arkprofile")],
      { mapToken: "Genesis_WP" },
    );
    expect(missing).toEqual(["Genesis_WP.ark"]);
  });
});
