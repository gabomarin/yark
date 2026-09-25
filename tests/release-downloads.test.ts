import { describe, expect, it } from "vitest";
import { safeEqual, sumExeDownloads } from "../workers/release-downloads/src/counting";

describe("sumExeDownloads", () => {
  it("counts only .exe assets, ignoring yml/blockmap/sha256", () => {
    const total = sumExeDownloads([
      {
        assets: [
          { name: "YARK-server-manager-Setup-0.23.0.exe", download_count: 120 },
          { name: "YARK-server-manager-Setup-0.23.0.exe.blockmap", download_count: 999 },
          { name: "latest.yml", download_count: 999 },
          { name: "YARK-server-manager-Setup-0.23.0.exe.sha256", download_count: 1 },
        ],
      },
      {
        assets: [
          { name: "YARK-server-manager-Setup-0.22.0.exe", download_count: 80 },
          { name: "YARK-server-manager-Setup-0.22.0.exe.blockmap", download_count: 999 },
        ],
      },
    ]);

    expect(total).toBe(200);
  });

  it("tolerates releases without assets and missing assets array", () => {
    expect(sumExeDownloads([{}, { assets: [] }])).toBe(0);
  });

  it("matches .EXE case-insensitively", () => {
    expect(sumExeDownloads([{ assets: [{ name: "Setup.EXE", download_count: 3 }] }])).toBe(3);
  });
});

describe("safeEqual", () => {
  it("accepts an exact match and rejects length/content differences", () => {
    expect(safeEqual("s3cret", "s3cret")).toBe(true);
    expect(safeEqual("s3cret", "s3cres")).toBe(false);
    expect(safeEqual("s3cret", "s3cret-longer")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
