import { describe, expect, it } from "vitest";
import {
  ASA_APP_ID,
  buildSteamCmdAppUpdateArgs,
  isContentCacheFresh,
  isRobocopySuccess,
  resolveAsaContentCacheDir,
  resolveDepotCacheDir,
  resolveSteamCmdCacheDir,
  resolveSteamCmdHome,
  shouldReuseAsaContentCache,
} from "@backend/domains/updates/steamcmd-content-cache";

describe("steamcmd-content-cache", () => {
  it("resolves home and cache paths next to steamcmd.exe", () => {
    expect(resolveSteamCmdHome("C:\\tools\\steamcmd\\steamcmd.exe")).toBe(
      "C:\\tools\\steamcmd",
    );
    expect(resolveDepotCacheDir("C:\\tools\\steamcmd")).toBe(
      "C:\\tools\\steamcmd\\steamapps\\depotcache",
    );
    expect(resolveAsaContentCacheDir("C:\\tools\\steamcmd")).toBe(
      "C:\\tools\\steamcmd\\asa_content_cache",
    );
    expect(resolveSteamCmdCacheDir("C:\\tools\\steamcmd", "depot")).toBe(
      "C:\\tools\\steamcmd\\steamapps\\depotcache",
    );
    expect(resolveSteamCmdCacheDir("C:\\tools\\steamcmd", "content")).toBe(
      "C:\\tools\\steamcmd\\asa_content_cache",
    );
  });

  it("puts force_install_dir before login", () => {
    const args = buildSteamCmdAppUpdateArgs("C:\\ark_servers\\cache");
    expect(args.indexOf("+force_install_dir")).toBeLessThan(args.indexOf("+login"));
    expect(args).toContain(ASA_APP_ID);
    expect(args).toContain("validate");
  });

  it("treats robocopy 0-7 as success", () => {
    expect(isRobocopySuccess(0)).toBe(true);
    expect(isRobocopySuccess(1)).toBe(true);
    expect(isRobocopySuccess(7)).toBe(true);
    expect(isRobocopySuccess(8)).toBe(false);
    expect(isRobocopySuccess(null)).toBe(false);
  });

  it("uses a moderate robocopy thread count for sync", async () => {
    const { ASA_CONTENT_SYNC_ROBOCOPY_THREADS } = await import(
      "@backend/domains/updates/steamcmd-content-cache"
    );
    expect(ASA_CONTENT_SYNC_ROBOCOPY_THREADS).toBeGreaterThanOrEqual(2);
    expect(ASA_CONTENT_SYNC_ROBOCOPY_THREADS).toBeLessThanOrEqual(4);
  });

  it("only considers a cache fresh when the manifest is recent", () => {
    expect(isContentCacheFresh("C:\\missing-cache", Date.now())).toBe(false);
    expect(isContentCacheFresh("C:\\missing-cache", 0)).toBe(false);
  });

  it("never skips the Steam query on an explicit update or verify", () => {
    const cacheDir = "C:\\missing-cache";
    expect(shouldReuseAsaContentCache("update", cacheDir, Date.now())).toBe(false);
    expect(shouldReuseAsaContentCache("verify-files", cacheDir, Date.now())).toBe(false);
  });

  it("skips content sync only when cache and install are the same path", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const {
      canSkipAsaContentSync,
      readAsaManifestBuildId,
    } = await import("@backend/domains/updates/steamcmd-content-cache");

    const root = mkdtempSync(join(tmpdir(), "asa-sync-skip-"));
    try {
      const cache = join(root, "cache");
      const install = join(root, "install");
      mkdirSync(join(cache, "steamapps"), { recursive: true });
      mkdirSync(join(install, "steamapps"), { recursive: true });
      const manifest = `"AppState"\n{\n\t"buildid"\t\t"999001"\n}\n`;
      writeFileSync(join(cache, "steamapps", `appmanifest_${ASA_APP_ID}.acf`), manifest);
      writeFileSync(join(install, "steamapps", `appmanifest_${ASA_APP_ID}.acf`), manifest);

      expect(readAsaManifestBuildId(cache)).toBe("999001");
      // Matching buildids alone must not skip — install tree may still be incomplete.
      expect(canSkipAsaContentSync(cache, install)).toBe(false);
      expect(canSkipAsaContentSync(cache, cache)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("OperationCancelledError", () => {
  it("is detectable via helper", async () => {
    const { isOperationCancelledError, OperationCancelledError } = await import(
      "@backend/domains/updates/steamcmd-content-cache"
    );
    expect(isOperationCancelledError(new OperationCancelledError())).toBe(true);
    expect(isOperationCancelledError(new Error("other"))).toBe(false);
  });
});
