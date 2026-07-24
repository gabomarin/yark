import { describe, expect, it } from "vitest";
import {
  ASA_APP_ID,
  buildSteamCmdAppUpdateArgs,
  isContentCacheFresh,
  isRobocopySuccess,
  resolveAsaContentCacheDir,
  resolveDepotCacheDir,
  resolveSteamCmdHome,
  shouldReuseAsaContentCache,
} from "@backend/domains/updates/steamcmd-content-cache";

describe("steamcmd-content-cache", () => {
  it("resuelve home y rutas de caché junto a steamcmd.exe", () => {
    expect(resolveSteamCmdHome("C:\\tools\\steamcmd\\steamcmd.exe")).toBe(
      "C:\\tools\\steamcmd",
    );
    expect(resolveDepotCacheDir("C:\\tools\\steamcmd")).toBe(
      "C:\\tools\\steamcmd\\steamapps\\depotcache",
    );
    expect(resolveAsaContentCacheDir("C:\\tools\\steamcmd")).toBe(
      "C:\\tools\\steamcmd\\asa_content_cache",
    );
  });

  it("pone force_install_dir antes de login", () => {
    const args = buildSteamCmdAppUpdateArgs("C:\\ark_servers\\cache");
    expect(args.indexOf("+force_install_dir")).toBeLessThan(args.indexOf("+login"));
    expect(args).toContain(ASA_APP_ID);
    expect(args).toContain("validate");
  });

  it("trata robocopy 0-7 como éxito", () => {
    expect(isRobocopySuccess(0)).toBe(true);
    expect(isRobocopySuccess(1)).toBe(true);
    expect(isRobocopySuccess(7)).toBe(true);
    expect(isRobocopySuccess(8)).toBe(false);
    expect(isRobocopySuccess(null)).toBe(false);
  });

  it("solo considera fresca una caché con manifest reciente", () => {
    expect(isContentCacheFresh("C:\\missing-cache", Date.now())).toBe(false);
    expect(isContentCacheFresh("C:\\missing-cache", 0)).toBe(false);
  });

  it("nunca omite la consulta a Steam en un update o verify explícito", () => {
    const cacheDir = "C:\\missing-cache";
    expect(shouldReuseAsaContentCache("update", cacheDir, Date.now())).toBe(false);
    expect(shouldReuseAsaContentCache("verify-files", cacheDir, Date.now())).toBe(false);
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
