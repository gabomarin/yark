import { describe, expect, it } from "vitest";
import {
  assertPlayersRestoreArchiveLayout,
  isRestoreHistoryOwnedByJob,
  preferredWorldMapRestoreFolderName,
  resolveWorldRestoreMapToken,
  shouldCopyWorldRestoreFile,
} from "@backend/domains/backups/backup-restore";

describe("preferredWorldMapRestoreFolderName", () => {
  it("prefers mapSaveFolder, then manifest folder, then token", () => {
    expect(
      preferredWorldMapRestoreFolderName({
        mapToken: "TheIsland_WP",
        mapSaveFolder: "CustomIsland",
        mapFolderName: "FromManifest",
      }),
    ).toBe("CustomIsland");
    expect(
      preferredWorldMapRestoreFolderName({
        mapToken: "TheIsland_WP",
        mapSaveFolder: null,
        mapFolderName: "FromManifest",
      }),
    ).toBe("FromManifest");
    expect(
      preferredWorldMapRestoreFolderName({
        mapToken: "TheIsland_WP",
        mapSaveFolder: null,
        mapFolderName: null,
      }),
    ).toBe("TheIsland_WP");
  });

  it("returns null for unsafe tokens", () => {
    expect(
      preferredWorldMapRestoreFolderName({
        mapToken: "../evil",
        mapSaveFolder: null,
        mapFolderName: null,
      }),
    ).toBeNull();
  });
});

describe("resolveWorldRestoreMapToken", () => {
  it("uses backup mapToken when safe", () => {
    expect(
      resolveWorldRestoreMapToken({
        backupMapToken: "Aberration_WP",
        serverMap: "TheIsland_WP",
        serverMapPathExists: true,
        backupSavedDirNames: ["TheIsland_WP"],
      }),
    ).toBe("Aberration_WP");
  });

  it("uses server map when that folder exists in the archive", () => {
    expect(
      resolveWorldRestoreMapToken({
        backupMapToken: null,
        serverMap: "TheIsland_WP",
        serverMapPathExists: true,
        backupSavedDirNames: [],
      }),
    ).toBe("TheIsland_WP");
  });

  it("uses the sole safe SavedArks directory when token is missing", () => {
    expect(
      resolveWorldRestoreMapToken({
        backupMapToken: null,
        serverMap: "Other_WP",
        serverMapPathExists: false,
        backupSavedDirNames: ["OnlyMap_WP"],
      }),
    ).toBe("OnlyMap_WP");
  });

  it("falls back to server map when multiple dirs exist", () => {
    expect(
      resolveWorldRestoreMapToken({
        backupMapToken: null,
        serverMap: "TheIsland_WP",
        serverMapPathExists: false,
        backupSavedDirNames: ["A_WP", "B_WP"],
      }),
    ).toBe("TheIsland_WP");
  });

  it("throws when nothing can be resolved", () => {
    expect(() =>
      resolveWorldRestoreMapToken({
        backupMapToken: null,
        serverMap: "../bad",
        serverMapPathExists: false,
        backupSavedDirNames: ["A_WP", "B_WP"],
      }),
    ).toThrow(/World backup map name could not be resolved/);
  });
});

describe("shouldCopyWorldRestoreFile", () => {
  it("skips profiles/tribes when restoreProfilesTribes is false", () => {
    expect(
      shouldCopyWorldRestoreFile({
        fileName: "123456789012345678.arkprofile",
        mapToken: "TheIsland_WP",
        restoreProfilesTribes: false,
      }),
    ).toBe(false);
  });

  it("copies primary world save and anti-corruption companions", () => {
    expect(
      shouldCopyWorldRestoreFile({
        fileName: "TheIsland_WP.ark",
        mapToken: "TheIsland_WP",
        restoreProfilesTribes: true,
      }),
    ).toBe(true);
  });

  it("skips transient and non-primary .ark noise", () => {
    expect(
      shouldCopyWorldRestoreFile({
        fileName: "noise.tmp",
        mapToken: "TheIsland_WP",
        restoreProfilesTribes: true,
      }),
    ).toBe(false);
    expect(
      shouldCopyWorldRestoreFile({
        fileName: "TheIsland_WP_123.ark",
        mapToken: "TheIsland_WP",
        restoreProfilesTribes: true,
      }),
    ).toBe(false);
  });
});

describe("assertPlayersRestoreArchiveLayout", () => {
  it("rejects legacy SavedArks-only player archives", () => {
    expect(() =>
      assertPlayersRestoreArchiveLayout({
        hasPlayerProfilesRoot: false,
        hasSavedArksAtBackupRoot: true,
        relativePathsUnderPlayerProfiles: [],
      }),
    ).toThrow(/legacy nested layout/);
  });

  it("rejects nested profile paths", () => {
    expect(() =>
      assertPlayersRestoreArchiveLayout({
        hasPlayerProfilesRoot: true,
        hasSavedArksAtBackupRoot: false,
        relativePathsUnderPlayerProfiles: ["TheIsland_WP\\player.arkprofile"],
      }),
    ).toThrow(/nests profiles under a map folder/);
  });

  it("accepts a flat PlayerProfiles layout", () => {
    expect(() =>
      assertPlayersRestoreArchiveLayout({
        hasPlayerProfilesRoot: true,
        hasSavedArksAtBackupRoot: false,
        relativePathsUnderPlayerProfiles: ["player.arkprofile"],
      }),
    ).not.toThrow();
  });
});

describe("isRestoreHistoryOwnedByJob", () => {
  it("requires matching server, backup, and critical-job marker notes", () => {
    expect(
      isRestoreHistoryOwnedByJob("job-1", "srv-1", "bak-1", {
        serverId: "srv-1",
        backupId: "bak-1",
        notes: "Safeguard [critical-job:job-1]",
      }),
    ).toBe(true);
    expect(
      isRestoreHistoryOwnedByJob("job-1", "srv-1", "bak-1", {
        serverId: "srv-1",
        backupId: "bak-other",
        notes: "Safeguard [critical-job:job-1]",
      }),
    ).toBe(false);
    expect(
      isRestoreHistoryOwnedByJob("job-1", "srv-1", "bak-1", {
        serverId: "srv-1",
        backupId: "bak-1",
        notes: "no marker",
      }),
    ).toBe(false);
  });
});
