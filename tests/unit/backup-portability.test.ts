import { describe, expect, it } from "vitest";
import {
  asBackupKind,
  asBackupType,
  parseBackupManifest,
} from "@backend/domains/backups/backup-archive";
import {
  buildImportedZipFileName,
  diskImportNotes,
  folderLooksLikeBackupArchive,
  guessBackupKindFromName,
  guessBackupTypeFromName,
  portableImportNotes,
  resolveExportZipDestination,
  resolveImportEntryKind,
  resolveImportedBackupId,
  shouldSkipKindSubdirOnRootScan,
  slugBackupFilePart,
} from "@backend/domains/backups/backup-portability";

describe("slugBackupFilePart", () => {
  it("lowercases and replaces non-alnum runs with dashes", () => {
    expect(slugBackupFilePart("My Server!!")).toBe("my-server");
    expect(slugBackupFilePart("--Hello--")).toBe("hello");
  });
});

describe("guessBackupKindFromName", () => {
  it("detects players, ini, and world markers", () => {
    expect(guessBackupKindFromName("srv-players-manual.zip")).toBe("players");
    expect(guessBackupKindFromName("player_connect-x.zip")).toBe("players");
    expect(guessBackupKindFromName("srv-ini-manual.zip")).toBe("ini");
    expect(guessBackupKindFromName("ini_save-x.zip")).toBe("ini");
    expect(guessBackupKindFromName("srv-world-scheduled.zip")).toBe("world");
    expect(guessBackupKindFromName("random.zip")).toBeNull();
  });
});

describe("guessBackupTypeFromName", () => {
  it("prefers disconnect before connect and defaults to manual", () => {
    expect(guessBackupTypeFromName("player_disconnect.zip")).toBe("player_disconnect");
    expect(guessBackupTypeFromName("player_connect.zip")).toBe("player_connect");
    expect(guessBackupTypeFromName("pre_update-world.zip")).toBe("pre_update");
    expect(guessBackupTypeFromName("scheduled-world.zip")).toBe("scheduled");
    expect(guessBackupTypeFromName("plain.zip")).toBe("manual");
  });
});

describe("resolveExportZipDestination", () => {
  it("appends .zip when missing", () => {
    expect(resolveExportZipDestination("C:\\out\\backup")).toBe("C:\\out\\backup.zip");
    expect(resolveExportZipDestination("C:\\out\\backup.ZIP")).toBe("C:\\out\\backup.ZIP");
  });
});

describe("buildImportedZipFileName", () => {
  it("builds slug-kind-imported-stamp names", () => {
    expect(
      buildImportedZipFileName({
        serverName: "Island One",
        kind: "world",
        stamp: "20260101-120000",
      }),
    ).toBe("island-one-world-imported-20260101-120000.zip");
  });
});

describe("folderLooksLikeBackupArchive", () => {
  it("is true when any layout marker is present", () => {
    expect(
      folderLooksLikeBackupArchive({
        hasManifest: false,
        hasSavedArks: false,
        hasPlayerProfiles: false,
        hasConfigWindowsServer: false,
      }),
    ).toBe(false);
    expect(
      folderLooksLikeBackupArchive({
        hasManifest: true,
        hasSavedArks: false,
        hasPlayerProfiles: false,
        hasConfigWindowsServer: false,
      }),
    ).toBe(true);
  });
});

describe("resolveImportEntryKind", () => {
  it("uses defaultKind, then guess, then world", () => {
    expect(resolveImportEntryKind("ini", "anything.zip")).toBe("ini");
    expect(resolveImportEntryKind(null, "srv-players-x.zip")).toBe("players");
    expect(resolveImportEntryKind(null, "orphan.zip")).toBe("world");
  });
});

describe("shouldSkipKindSubdirOnRootScan", () => {
  it("skips kind folders only on root scans", () => {
    expect(shouldSkipKindSubdirOnRootScan(true, null, "World")).toBe(true);
    expect(shouldSkipKindSubdirOnRootScan(true, "world", "World")).toBe(false);
    expect(shouldSkipKindSubdirOnRootScan(false, null, "World")).toBe(false);
  });
});

describe("resolveImportedBackupId", () => {
  it("keeps free ids and clears taken ones", () => {
    expect(resolveImportedBackupId("id-1", false)).toBe("id-1");
    expect(resolveImportedBackupId("id-1", true)).toBeUndefined();
    expect(resolveImportedBackupId(undefined, false)).toBeUndefined();
  });
});

describe("import notes", () => {
  it("keeps operator-facing prefixes", () => {
    expect(portableImportNotes("src.zip")).toBe("Imported portable archive: src.zip");
    expect(diskImportNotes("disk.zip")).toBe("Imported from disk: disk.zip");
  });
});

describe("parseBackupManifest", () => {
  it("returns null for empty or invalid payloads", () => {
    expect(parseBackupManifest(null)).toBeNull();
    expect(parseBackupManifest("")).toBeNull();
    expect(parseBackupManifest("{")).toBeNull();
    expect(parseBackupManifest(JSON.stringify({}))).toBeNull();
  });

  it("parses type/kind and safe map fields", () => {
    const parsed = parseBackupManifest(
      JSON.stringify({
        server: { map: "TheIsland_WP" },
        backup: {
          id: "b1",
          type: "scheduled",
          kind: "world",
          createdAt: "2026-01-01T00:00:00.000Z",
          notes: "n",
          mapFolderName: "CustomFolder",
        },
      }),
    );
    expect(parsed).toEqual({
      id: "b1",
      type: "scheduled",
      kind: "world",
      createdAt: "2026-01-01T00:00:00.000Z",
      notes: "n",
      mapToken: "TheIsland_WP",
      mapFolderName: "CustomFolder",
    });
  });

  it("strips unsafe map tokens and folder names", () => {
    const parsed = parseBackupManifest(
      JSON.stringify({
        backup: {
          type: "manual",
          kind: "world",
          mapToken: "../evil",
          mapFolderName: "bad/name",
        },
      }),
    );
    expect(parsed?.mapToken).toBeNull();
    expect(parsed?.mapFolderName).toBeNull();
  });
});

describe("asBackupType / asBackupKind", () => {
  it("allowlists known values", () => {
    expect(asBackupType("manual")).toBe("manual");
    expect(asBackupType("nope")).toBeUndefined();
    expect(asBackupKind("players")).toBe("players");
    expect(asBackupKind("mods")).toBeUndefined();
  });
});
