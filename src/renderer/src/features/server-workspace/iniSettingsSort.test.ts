import { beforeEach, describe, expect, it } from "vitest";
import { INI_SETTINGS_SORT_STORAGE_KEY, readStoredIniSettingsSort, writeStoredIniSettingsSort } from "./iniSettingsSort";

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
});
