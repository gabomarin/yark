import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INI_SETTINGS_SORT_STORAGE_KEY,
  readStoredIniSettingsSort,
  writeStoredIniSettingsSort,
} from "./iniSettingsSort";

describe("INI settings sort preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to unsorted and remembers alphabetical", () => {
    expect(readStoredIniSettingsSort()).toBe("unsorted");

    writeStoredIniSettingsSort("alphabetical");

    expect(window.localStorage.getItem(INI_SETTINGS_SORT_STORAGE_KEY)).toBe("alphabetical");
    expect(readStoredIniSettingsSort()).toBe("alphabetical");

    writeStoredIniSettingsSort("asInFile");

    expect(readStoredIniSettingsSort()).toBe("asInFile");
  });

  it("ignores an unknown stored value", () => {
    window.localStorage.setItem(INI_SETTINGS_SORT_STORAGE_KEY, "category");

    expect(readStoredIniSettingsSort()).toBe("unsorted");
  });

  it("falls back to unsorted when localStorage throws", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });

    expect(readStoredIniSettingsSort()).toBe("unsorted");
    expect(() => writeStoredIniSettingsSort("alphabetical")).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
