import { describe, expect, it, vi, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  adminListAsaPointerPath,
  adminListPath,
  classifyAdminListUrl,
  clampUpdateAllowedCheatersInterval,
  DEFAULT_UPDATE_ALLOWED_CHEATERS_INTERVAL,
  ensureAdminListFile,
  formatAdminListUrlForIni,
  formatLocalAdminListFileUrlForIni,
  getAdminListState,
  legacyAdminListPath,
  parseAdminListIds,
  refreshAdminListBeforeStart,
  setAdminListConfig,
  syncAdminListAsaPointer,
  unwrapIniUrl,
  windowsPathFromAdminListFileUrl,
} from "@backend/domains/instances/admin-list";
import { gameUserSettingsIniPath } from "@backend/domains/instances/sync-profile-ini";
import { readIniServerSetting } from "@backend/domains/instances/ban-list";

describe("admin-list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves wiki AllowedCheaterAccountIDs.txt under Saved", () => {
    expect(adminListPath("C:\\ARK\\Island")).toBe(
      "C:\\ARK\\Island\\ShooterGame\\Saved\\AllowedCheaterAccountIDs.txt",
    );
  });

  it("resolves legacy Win64 AdminList.txt next to the binary", () => {
    expect(legacyAdminListPath("C:\\ARK\\Island")).toBe(
      "C:\\ARK\\Island\\ShooterGame\\Binaries\\Win64\\AdminList.txt",
    );
  });

  it("parses one id per line and skips comments", () => {
    expect(
      parseAdminListIds(
        "# comment\n0002e03af5f4487985e94c6ba4080369\n\n0002aabbccddeeff0011223344556677\n",
      ),
    ).toEqual([
      "0002e03af5f4487985e94c6ba4080369",
      "0002aabbccddeeff0011223344556677",
    ]);
  });

  it("trims whitespace/tabs and blank lines when parsing ids", () => {
    expect(
      parseAdminListIds(
        "\t  0002e03af5f4487985e94c6ba4080369  \t\n\n   \n\t\n0002aabbccddeeff0011223344556677\ttrailing\n",
      ),
    ).toEqual([
      "0002e03af5f4487985e94c6ba4080369",
      "0002aabbccddeeff0011223344556677",
    ]);
  });

  it("dedupes ids case-insensitively", () => {
    expect(parseAdminListIds("Abc\nabc\nABC\n")).toEqual(["Abc"]);
  });

  it("classifies blank / N/A / file:// as local and http(s) as remote", () => {
    expect(classifyAdminListUrl(null)).toBe("local");
    expect(classifyAdminListUrl("")).toBe("local");
    expect(classifyAdminListUrl("N/A")).toBe("local");
    expect(classifyAdminListUrl('"N/A"')).toBe("local");
    expect(classifyAdminListUrl("https://example.com/admins.txt")).toBe("remote");
    expect(classifyAdminListUrl('"http://example.com/a.txt"')).toBe("remote");
    expect(
      classifyAdminListUrl(
        '"file://C:\\\\ARK\\\\ShooterGame\\\\Saved\\\\AllowedCheaterAccountIDs.txt"',
      ),
    ).toBe("local");
    expect(classifyAdminListUrl("C:\\admins.txt")).toBe("misconfigured");
  });

  it("unwraps quoted INI URLs", () => {
    expect(unwrapIniUrl('"https://example.com/a.txt"')).toBe(
      "https://example.com/a.txt",
    );
  });

  it("formats http(s) AdminListURL with quotes for INI", () => {
    expect(formatAdminListUrlForIni("https://example.com/a.txt")).toBe(
      '"https://example.com/a.txt"',
    );
    expect(formatAdminListUrlForIni("")).toBe("");
    expect(formatAdminListUrlForIni("N/A")).toBe("");
  });

  it("formats local wiki path as file:/// with forward slashes", () => {
    expect(formatLocalAdminListFileUrlForIni("C:\\ARK\\Island")).toBe(
      '"file:///C:/ARK/Island/ShooterGame/Saved/AllowedCheaterAccountIDs.txt"',
    );
  });

  it("prefers loopback http AdminListURL when gateway base is provided", () => {
    const install = "C:\\yark_test_servers\\first test";
    const mirrorRoot = "C:\\yark_dev_profile\\admin-lists";
    expect(
      formatLocalAdminListFileUrlForIni(install, {
        asaMirrorRoot: mirrorRoot,
        loopbackBaseUrl: "http://127.0.0.1:34567",
      }),
    ).toMatch(/^"http:\/\/127\.0\.0\.1:34567\/[a-f0-9]{16}\.txt"$/);
  });

  it("classifies loopback http AdminListURL as local", () => {
    expect(
      classifyAdminListUrl("http://127.0.0.1:34567/c4537c5632d684ee.txt"),
    ).toBe("local");
    expect(
      classifyAdminListUrl('"http://localhost:9/aaaaaaaaaaaaaaaa.txt"'),
    ).toBe("local");
  });

  it("mirrors ASA pointer under configured userData admin-lists when wiki path has spaces", () => {
    const install = "C:\\yark_test_servers\\first test";
    const mirrorRoot =
      "C:\\Users\\op\\AppData\\Roaming\\yark-server-manager\\admin-lists";
    const pointer = adminListAsaPointerPath(install, mirrorRoot);
    expect(pointer.startsWith(mirrorRoot + "\\") || pointer.startsWith(mirrorRoot + "/")).toBe(
      true,
    );
    expect(pointer.endsWith(".txt")).toBe(true);
    expect(/\s/.test(pointer)).toBe(false);
    expect(pointer.toLowerCase().includes("first test")).toBe(false);
    expect(
      windowsPathFromAdminListFileUrl(
        formatLocalAdminListFileUrlForIni(install, mirrorRoot),
      ),
    ).toBe(pointer);
  });

  it("syncs wiki ids into the space-free ASA pointer file", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-space-"));
    const install = join(root, "first test");
    const mirrorRoot = join(root, "admin-lists");
    try {
      await mkdir(join(install, "ShooterGame", "Saved"), { recursive: true });
      await writeFile(
        adminListPath(install),
        "0002e03af5f4487985e94c6ba4080369\n",
        "utf8",
      );
      const pointer = await syncAdminListAsaPointer(install, mirrorRoot);
      expect(pointer).toBe(adminListAsaPointerPath(install, mirrorRoot));
      expect(await readFile(pointer, "utf8")).toContain(
        "0002e03af5f4487985e94c6ba4080369",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("sanitizes blank/tab rows in wiki and mirror on sync", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-sanitize-"));
    const install = join(root, "first test");
    const mirrorRoot = join(root, "admin-lists");
    try {
      await mkdir(join(install, "ShooterGame", "Saved"), { recursive: true });
      await writeFile(
        adminListPath(install),
        "\t 0002e03af5f4487985e94c6ba4080369 \t\n\n  \t\n0002aabbccddeeff0011223344556677\n",
        "utf8",
      );
      const pointer = await syncAdminListAsaPointer(install, mirrorRoot);
      expect(await readFile(adminListPath(install), "utf8")).toBe(
        "0002e03af5f4487985e94c6ba4080369\n0002aabbccddeeff0011223344556677\n",
      );
      expect(await readFile(pointer, "utf8")).toBe(
        "0002e03af5f4487985e94c6ba4080369\n0002aabbccddeeff0011223344556677\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refresh before start re-copies out-of-band wiki edits into the mirror", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-start-"));
    const install = join(root, "first test");
    const mirrorRoot = join(root, "admin-lists");
    try {
      await mkdir(
        join(install, "ShooterGame", "Saved", "Config", "WindowsServer"),
        { recursive: true },
      );
      await writeFile(
        adminListPath(install),
        "0002e03af5f4487985e94c6ba4080369\n",
        "utf8",
      );
      await writeFile(
        gameUserSettingsIniPath(install),
        `[ServerSettings]\nAdminListURL=${formatLocalAdminListFileUrlForIni(install, mirrorRoot)}\n`,
        "utf8",
      );
      const pointer = await syncAdminListAsaPointer(install, mirrorRoot);
      expect(await readFile(pointer, "utf8")).toContain(
        "0002e03af5f4487985e94c6ba4080369",
      );

      // Operator edits wiki outside YARK.
      await writeFile(
        adminListPath(install),
        "0002aabbccddeeff0011223344556677\n",
        "utf8",
      );
      await refreshAdminListBeforeStart(install, mirrorRoot);
      expect(await readFile(pointer, "utf8")).toBe(
        "0002aabbccddeeff0011223344556677\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("heals file:// with spaces to the space-free mirror via refresh helper", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-heal-space-"));
    const install = join(root, "first test");
    const mirrorRoot = join(root, "admin-lists");
    try {
      await mkdir(
        join(install, "ShooterGame", "Saved", "Config", "WindowsServer"),
        { recursive: true },
      );
      await writeFile(
        adminListPath(install),
        "0002e03af5f4487985e94c6ba4080369\n",
        "utf8",
      );
      // Force a spaced wiki file:// into GUS (broken for ASA).
      const spacedUrl = `"file://${adminListPath(install).replace(/\\/g, "\\\\")}"`;
      await writeFile(
        gameUserSettingsIniPath(install),
        `[ServerSettings]\nAdminListURL=${spacedUrl}\n`,
        "utf8",
      );
      await refreshAdminListBeforeStart(install, mirrorRoot);
      const gus = await readFile(gameUserSettingsIniPath(install), "utf8");
      const written = readIniServerSetting(gus, "AdminListURL");
      expect(written).toBe(
        formatLocalAdminListFileUrlForIni(install, mirrorRoot),
      );
      expect(written?.includes("first test")).toBe(false);
      expect(written?.includes("admin-lists")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("heals two-slash file:// to three-slash file:/// via refresh helper", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-slash-"));
    const install = join(root, "Island");
    try {
      await mkdir(
        join(install, "ShooterGame", "Saved", "Config", "WindowsServer"),
        { recursive: true },
      );
      await writeFile(
        adminListPath(install),
        "0002e03af5f4487985e94c6ba4080369\n",
        "utf8",
      );
      const twoSlash = `"file://${adminListPath(install).replace(/\\/g, "\\\\")}"`;
      await writeFile(
        gameUserSettingsIniPath(install),
        `[ServerSettings]\nAdminListURL=${twoSlash}\n`,
        "utf8",
      );
      await refreshAdminListBeforeStart(install);
      const written = readIniServerSetting(
        await readFile(gameUserSettingsIniPath(install), "utf8"),
        "AdminListURL",
      );
      expect(written).toBe(formatLocalAdminListFileUrlForIni(install));
      expect(written?.startsWith('"file:///')).toBe(true);
      expect(written?.includes("\\\\")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("clamps UpdateAllowedCheatersInterval (min 3, default 600)", () => {
    expect(clampUpdateAllowedCheatersInterval(1)).toBe(3);
    expect(clampUpdateAllowedCheatersInterval(2.9)).toBe(3);
    expect(clampUpdateAllowedCheatersInterval(600)).toBe(600);
    expect(clampUpdateAllowedCheatersInterval(Number.NaN)).toBe(
      DEFAULT_UPDATE_ALLOWED_CHEATERS_INTERVAL,
    );
  });

  it("ensures wiki file and clears legacy AdminList.txt", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-ensure-"));
    try {
      const win64 = join(root, "ShooterGame", "Binaries", "Win64");
      await mkdir(win64, { recursive: true });
      const legacy = legacyAdminListPath(root);
      await writeFile(legacy, "should-be-cleared\n", "utf8");
      const path = await ensureAdminListFile(root);
      expect(path).toBe(adminListPath(root));
      expect(existsSync(path)).toBe(true);
      expect(existsSync(legacy)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads local ids from wiki file when AdminListURL is blank", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-local-"));
    try {
      await mkdir(join(root, "ShooterGame", "Saved", "Config", "WindowsServer"), {
        recursive: true,
      });
      await writeFile(
        adminListPath(root),
        "0002e03af5f4487985e94c6ba4080369\n",
        "utf8",
      );
      await writeFile(
        gameUserSettingsIniPath(root),
        "[ServerSettings]\nAdminListURL=\nUpdateAllowedCheatersInterval=600\n",
        "utf8",
      );
      const state = await getAdminListState(root);
      expect(state.mode).toBe("local");
      expect(state.entries).toEqual([
        { id: "0002e03af5f4487985e94c6ba4080369", name: null },
      ]);
      expect(state.listError).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes remote config and rejects bare paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-set-"));
    try {
      await mkdir(join(root, "ShooterGame", "Saved", "Config", "WindowsServer"), {
        recursive: true,
      });
      await writeFile(
        gameUserSettingsIniPath(root),
        "[ServerSettings]\nSessionName=Test\n",
        "utf8",
      );

      await expect(
        setAdminListConfig(root, {
          adminListUrl: "C:\\admins.txt",
          updateAllowedCheatersInterval: 60,
        }),
      ).rejects.toThrow(/http\(s\)/i);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          text: async () => "0002aaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
        })),
      );

      const state = await setAdminListConfig(root, {
        adminListUrl: "https://example.com/admins.txt",
        updateAllowedCheatersInterval: 1,
      });
      expect(state.mode).toBe("remote");
      expect(state.updateAllowedCheatersInterval).toBe(3);
      expect(state.entries).toEqual([
        { id: "0002aaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: null },
      ]);

      const gus = await readFile(gameUserSettingsIniPath(root), "utf8");
      expect(readIniServerSetting(gus, "AdminListURL")).toBe(
        '"https://example.com/admins.txt"',
      );
      expect(readIniServerSetting(gus, "UpdateAllowedCheatersInterval")).toBe(
        "3",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("clearing URL removes AdminListURL (optional; no file:// rewrite)", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-clear-"));
    try {
      await mkdir(join(root, "ShooterGame", "Saved", "Config", "WindowsServer"), {
        recursive: true,
      });
      await writeFile(
        gameUserSettingsIniPath(root),
        '[ServerSettings]\nAdminListURL="https://example.com/a.txt"\n',
        "utf8",
      );
      const state = await setAdminListConfig(root, {
        adminListUrl: "",
        updateAllowedCheatersInterval: 600,
      });
      expect(state.mode).toBe("local");
      expect(state.adminListUrl).toBe("");
      const gus = await readFile(gameUserSettingsIniPath(root), "utf8");
      expect(readIniServerSetting(gus, "AdminListURL")).toBeNull();
      expect(readIniServerSetting(gus, "UpdateAllowedCheatersInterval")).toBe(
        "600",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("heals legacy blank/N/A local AdminListURL to file:/// via refresh helper", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-admin-heal-"));
    try {
      await mkdir(join(root, "ShooterGame", "Saved", "Config", "WindowsServer"), {
        recursive: true,
      });
      await writeFile(
        adminListPath(root),
        "0002e03af5f4487985e94c6ba4080369\n",
        "utf8",
      );
      await writeFile(
        gameUserSettingsIniPath(root),
        "[ServerSettings]\nAdminListURL=N/A\n",
        "utf8",
      );
      await refreshAdminListBeforeStart(root);
      const state = await getAdminListState(root);
      expect(state.mode).toBe("local");
      expect(state.entries).toEqual([
        { id: "0002e03af5f4487985e94c6ba4080369", name: null },
      ]);
      const gus = await readFile(gameUserSettingsIniPath(root), "utf8");
      expect(readIniServerSetting(gus, "AdminListURL")).toBe(
        formatLocalAdminListFileUrlForIni(root),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("learns and reloads display names from the YARK sidecar", async () => {
    const {
      adminListNamesPath,
      getAdminListState: getState,
      learnAdminListNames,
    } = await import("@backend/domains/instances/admin-list");
    const root = await mkdtemp(join(tmpdir(), "yark-admin-names-"));
    try {
      await mkdir(join(root, "ShooterGame", "Saved"), { recursive: true });
      await writeFile(
        adminListPath(root),
        "0002e03af5f4487985e94c6ba4080369\n0002aaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
        "utf8",
      );
      const learned = await learnAdminListNames(root, [
        { id: "0002e03af5f4487985e94c6ba4080369", name: "gabomarin26" },
      ]);
      expect(learned.updated).toBe(1);
      expect(existsSync(adminListNamesPath(root))).toBe(true);
      const state = await getState(root);
      expect(state.entries).toEqual([
        { id: "0002e03af5f4487985e94c6ba4080369", name: "gabomarin26" },
        { id: "0002aaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: null },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not seed empty wiki from names sidecar on read", async () => {
    const {
      adminListNamesPath,
      getAdminListState: getState,
      learnAdminListNames,
    } = await import("@backend/domains/instances/admin-list");
    const root = await mkdtemp(join(tmpdir(), "yark-admin-seed-names-"));
    try {
      await mkdir(join(root, "ShooterGame", "Saved", "Config", "WindowsServer"), {
        recursive: true,
      });
      await writeFile(adminListPath(root), "", "utf8");
      await writeFile(
        gameUserSettingsIniPath(root),
        "[ServerSettings]\nAdminListURL=N/A\n",
        "utf8",
      );
      await learnAdminListNames(root, [
        { id: "0002e03af5f4487985e94c6ba4080369", name: "gabomarin26" },
      ]);
      expect(existsSync(adminListNamesPath(root))).toBe(true);
      const state = await getState(root);
      expect(state.mode).toBe("local");
      expect(state.entries).toEqual([]);
      expect((await readFile(adminListPath(root), "utf8")).trim()).toBe("");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
