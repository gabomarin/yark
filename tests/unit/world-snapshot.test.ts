import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import {
  copySavedArksFiles,
  isDatedWorldAutosaveName,
  isEssentialWorldSaveName,
  isPrimaryWorldSaveName,
  isTransientWorldSaveName,
  missingEssentialWorldRels,
  selectWorldBackupSourceFiles,
} from "@backend/domains/backups/world-snapshot";

describe("world-snapshot helpers", () => {
  it("classifies transient, primary, dated, and essential save names", () => {
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
    expect(isEssentialWorldSaveName("Tribe.arktribe")).toBe(true);
    expect(isEssentialWorldSaveName("765.arkprofile")).toBe(true);
    expect(isEssentialWorldSaveName("Genesis_WP.arkrbf")).toBe(false);
  });

  it("keeps primary saves and the newest two dated autosaves per map", () => {
    const selection = selectWorldBackupSourceFiles([
      { path: "C:\\a\\Genesis_WP.ark", name: "Genesis_WP.ark", mtimeMs: 100 },
      {
        path: "C:\\a\\Genesis_WP_01.01.2026_01.00.00.ark",
        name: "Genesis_WP_01.01.2026_01.00.00.ark",
        mtimeMs: 10,
      },
      {
        path: "C:\\a\\Genesis_WP_02.01.2026_01.00.00.ark",
        name: "Genesis_WP_02.01.2026_01.00.00.ark",
        mtimeMs: 20,
      },
      {
        path: "C:\\a\\Genesis_WP_03.01.2026_01.00.00.ark",
        name: "Genesis_WP_03.01.2026_01.00.00.ark",
        mtimeMs: 30,
      },
      {
        path: "C:\\a\\Genesis_WP_04.01.2026_01.00.00.ark",
        name: "Genesis_WP_04.01.2026_01.00.00.ark",
        mtimeMs: 40,
      },
      {
        path: "C:\\a\\TheIsland_WP.ark",
        name: "TheIsland_WP.ark",
        mtimeMs: 50,
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
    ]);

    const names = selection.selected.map((row) => row.name).sort();
    expect(names).toEqual([
      "Genesis_WP.ark",
      "Genesis_WP_03.01.2026_01.00.00.ark",
      "Genesis_WP_04.01.2026_01.00.00.ark",
      "TheIsland_WP.ark",
      "player.arkprofile",
    ]);
    expect(selection.skippedTransientCount).toBe(1);
    expect(selection.skippedOlderDatedCount).toBe(2);
    expect(selection.retainedDatedCount).toBe(2);
  });

  it("skips a disappearing transient file during copy", async () => {
    const sourceRoot = "C:\\SavedArks";
    const destRoot = "C:\\Staging\\SavedArks";
    const sourceFiles = [
      join(sourceRoot, "Genesis_WP.ark"),
      join(sourceRoot, "Genesis_WP_28.07.2026_06.53.34.arkrbf"),
    ];
    const copyFile = vi.fn(async (src: string) => {
      if (src.endsWith(".arkrbf")) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
    });

    const result = await copySavedArksFiles(
      sourceRoot,
      destRoot,
      sourceFiles,
      copyFile,
    );
    expect(result.copiedFileCount).toBe(1);
    expect(result.skippedTransientCount).toBe(1);
    expect(copyFile).toHaveBeenCalledTimes(2);
  });

  it("fails when an essential save disappears mid-copy", async () => {
    const sourceRoot = "C:\\SavedArks";
    const destRoot = "C:\\Staging\\SavedArks";
    const sourceFiles = [join(sourceRoot, "Genesis_WP.ark")];
    const copyFile = vi.fn(async () => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    await expect(
      copySavedArksFiles(sourceRoot, destRoot, sourceFiles, copyFile),
    ).rejects.toThrow(/Essential world save disappeared/);
  });

  it("does not treat a missing dated autosave as essential", async () => {
    const sourceRoot = "C:\\SavedArks";
    const destRoot = "C:\\Staging\\SavedArks";
    const sourceFiles = [
      join(sourceRoot, "Genesis_WP_28.07.2026_06.53.34.ark"),
    ];
    const copyFile = vi.fn(async () => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    await expect(
      copySavedArksFiles(sourceRoot, destRoot, sourceFiles, copyFile),
    ).rejects.toThrow("ENOENT");
  });

  it("does not suppress ENOENT for an unclassified file", async () => {
    const sourceRoot = "C:\\SavedArks";
    const destRoot = "C:\\Staging\\SavedArks";
    const sourceFiles = [join(sourceRoot, "metadata.db")];
    const copyFile = vi.fn(async () => {
      const err = new Error("destination unavailable") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    await expect(
      copySavedArksFiles(sourceRoot, destRoot, sourceFiles, copyFile),
    ).rejects.toThrow("destination unavailable");
  });

  it("detects missing essentials after copy by relative path", () => {
    const sourceRoot = "C:\\SavedArks";
    const destRoot = "C:\\Staging\\SavedArks";
    const missing = missingEssentialWorldRels(
      sourceRoot,
      destRoot,
      [join(sourceRoot, "Genesis_WP.ark"), join(sourceRoot, "noise.arkrbf")],
      [join(destRoot, "noise.arkrbf")],
    );
    expect(missing).toEqual(["Genesis_WP.ark"]);
  });

  it("does not require dated autosaves in the essential check", () => {
    const sourceRoot = "C:\\SavedArks";
    const destRoot = "C:\\Staging\\SavedArks";
    const missing = missingEssentialWorldRels(
      sourceRoot,
      destRoot,
      [
        join(sourceRoot, "Genesis_WP.ark"),
        join(sourceRoot, "Genesis_WP_28.07.2026_06.53.34.ark"),
      ],
      [join(destRoot, "Genesis_WP.ark")],
    );
    expect(missing).toEqual([]);
  });
});
