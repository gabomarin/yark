import { describe, expect, it } from "vitest";
import {
  banListCandidatePaths,
  banListPath,
  extractBanListId,
  formatBanListText,
  isBlankOrNaUrl,
  parseBanListText,
  readIniServerSetting,
} from "@backend/domains/instances/ban-list";

describe("ban-list", () => {
  it("resolves BanList.txt next to the dedicated binary", () => {
    expect(banListPath("C:\\ARK\\Island")).toBe(
      "C:\\ARK\\Island\\ShooterGame\\Binaries\\Win64\\BanList.txt",
    );
  });

  it("includes Win64 and fallback candidate paths", () => {
    expect(banListCandidatePaths("C:\\ARK\\Island")).toEqual([
      "C:\\ARK\\Island\\ShooterGame\\Binaries\\Win64\\BanList.txt",
      "C:\\ARK\\Island\\ShooterGame\\Saved\\BanList.txt",
      "C:\\ARK\\Island\\BanList.txt",
    ]);
  });

  it("parses one id per line and skips comments", () => {
    expect(
      parseBanListText("# comment\n76561198000000000\n\n0002e03af5f4487985e94c6ba4080369\n"),
    ).toEqual([
      "76561198000000000",
      "0002e03af5f4487985e94c6ba4080369",
    ]);
  });

  it("extracts only the id from ASA id,name,flags BanList lines", () => {
    expect(
      extractBanListId("0002e03af5f4487985e94c6ba4080369,gabomarin26,0"),
    ).toBe("0002e03af5f4487985e94c6ba4080369");
    expect(
      parseBanListText(
        "0002e03af5f4487985e94c6ba4080369,gabomarin26,0\n76561198000000000\n",
      ),
    ).toEqual([
      "0002e03af5f4487985e94c6ba4080369",
      "76561198000000000",
    ]);
  });

  it("formats ids as newline-separated text", () => {
    expect(formatBanListText(["a", "b"])).toBe("a\nb\n");
    expect(formatBanListText([])).toBe("");
  });

  it("treats blank and N/A INI URLs as empty", () => {
    expect(isBlankOrNaUrl(null)).toBe(true);
    expect(isBlankOrNaUrl("")).toBe(true);
    expect(isBlankOrNaUrl("N/A")).toBe(true);
    expect(isBlankOrNaUrl("https://example.com/bans.txt")).toBe(false);
  });

  it("reads ServerSettings keys from INI text", () => {
    expect(
      readIniServerSetting(
        "[ServerSettings]\nBanListURL=\"https://example.com/bans.txt\"\n",
        "BanListURL",
      ),
    ).toBe('"https://example.com/bans.txt"');
  });
});
