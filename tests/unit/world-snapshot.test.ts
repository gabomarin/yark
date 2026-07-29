import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import {
  copySavedArksFiles,
  isEssentialWorldSaveName,
  isTransientWorldSaveName,
  missingEssentialWorldRels,
} from "../../src/backend/domains/backups/world-snapshot";

describe("world-snapshot helpers", () => {
  it("classifies transient and essential save names", () => {
    expect(isTransientWorldSaveName("Genesis_WP_28.07.2026_06.53.34.arkrbf")).toBe(
      true,
    );
    expect(isTransientWorldSaveName("scratch.tmp")).toBe(true);
    expect(isTransientWorldSaveName("Genesis_WP.ark")).toBe(false);
    expect(isEssentialWorldSaveName("Genesis_WP.ark")).toBe(true);
    expect(isEssentialWorldSaveName("Tribe.arktribe")).toBe(true);
    expect(isEssentialWorldSaveName("765.arkprofile")).toBe(true);
    expect(isEssentialWorldSaveName("Genesis_WP.arkrbf")).toBe(false);
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
});
