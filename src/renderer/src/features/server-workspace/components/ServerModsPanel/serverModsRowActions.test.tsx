import { describe, expect, it, vi } from "vitest";
import { visibleRowActionItems } from "@ui/RowActionMenu/rowActionModel";
import {
  buildServerModsRowActions,
  CLEAR_DOWNLOADED_FILES_LABEL,
  STOP_SERVER_BEFORE_DELETE_MOD_FILES,
} from "./serverModsRowActions";
import type { ModRow } from "./serverModsModel";

const baseRow: ModRow = {
  key: "947033",
  id: "947033",
  slug: "awesome-spyglass",
  name: "Awesome Spyglass!",
  author: "Author",
  summary: "",
  url: "https://www.curseforge.com/ark-survival-ascended/mods/awesome-spyglass",
  thumbnailUrl: null,
  downloads: "1",
  downloadCount: 1,
  updated: "—",
  updatedAt: null,
  categories: [],
  enabled: true,
  configured: true,
  passive: false,
  loadIndex: 0,
  noPage: false,
};

describe("buildServerModsRowActions (#702)", () => {
  it("offers Open local folder and Clear downloaded files on server rows", () => {
    const onOpenLocalFolder = vi.fn();
    const onClearDownloadedFiles = vi.fn();
    const entries = buildServerModsRowActions({
      row: baseRow,
      mode: "server",
      busy: false,
      hasLocalFiles: true,
      onInspect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onOpenExternal: vi.fn(),
      onOpenLocalFolder,
      onClearDownloadedFiles,
    });
    const items = visibleRowActionItems(entries);
    expect(items.map((item) => item.key)).toEqual(
      expect.arrayContaining(["open-local-folder", "clear-downloaded-files", "remove"]),
    );
    expect(items.find((item) => item.key === "clear-downloaded-files")?.label).toBe(CLEAR_DOWNLOADED_FILES_LABEL);
    expect(items.find((item) => item.key === "open-local-folder")?.disabled).toBe(false);
    expect(items.find((item) => item.key === "clear-downloaded-files")?.disabled).toBe(false);

    items.find((item) => item.key === "open-local-folder")?.onClick();
    items.find((item) => item.key === "clear-downloaded-files")?.onClick();
    expect(onOpenLocalFolder).toHaveBeenCalledWith(baseRow);
    expect(onClearDownloadedFiles).toHaveBeenCalledWith(baseRow);
  });

  it("disables Open and Clear when no local files exist", () => {
    const entries = buildServerModsRowActions({
      row: baseRow,
      mode: "server",
      busy: false,
      hasLocalFiles: false,
      onInspect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onOpenExternal: vi.fn(),
      onOpenLocalFolder: vi.fn(),
      onClearDownloadedFiles: vi.fn(),
    });
    const items = visibleRowActionItems(entries);
    expect(items.find((item) => item.key === "open-local-folder")?.disabled).toBe(true);
    expect(items.find((item) => item.key === "clear-downloaded-files")?.disabled).toBe(true);
  });

  it("disables Clear downloaded files while the server is active", () => {
    const entries = buildServerModsRowActions({
      row: baseRow,
      mode: "server",
      busy: false,
      serverActive: true,
      hasLocalFiles: true,
      onInspect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onOpenExternal: vi.fn(),
      onOpenLocalFolder: vi.fn(),
      onClearDownloadedFiles: vi.fn(),
    });
    const clear = visibleRowActionItems(entries).find((item) => item.key === "clear-downloaded-files");
    expect(clear?.disabled).toBe(true);
    expect(clear?.title).toBe(STOP_SERVER_BEFORE_DELETE_MOD_FILES);
  });

  it("offers Move load-order actions when loadOrderIds is provided (#638)", () => {
    const onMoveLoadOrder = vi.fn();
    const entries = buildServerModsRowActions({
      row: { ...baseRow, loadIndex: 1 },
      mode: "server",
      busy: false,
      loadOrderIds: ["a", "947033", "c"],
      onInspect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onOpenExternal: vi.fn(),
      onMoveLoadOrder,
    });
    const items = visibleRowActionItems(entries);
    expect(items.map((item) => item.key)).toEqual(
      expect.arrayContaining(["move-top", "move-up", "move-down", "move-bottom"]),
    );
    expect(items.find((item) => item.key === "move-up")?.disabled).toBe(false);
    items.find((item) => item.key === "move-up")?.onClick();
    expect(onMoveLoadOrder).toHaveBeenCalledWith(expect.objectContaining({ id: "947033" }), "up");
  });

  it("disables Move to top / up for the first load-order row (#638)", () => {
    const entries = buildServerModsRowActions({
      row: baseRow,
      mode: "server",
      busy: false,
      loadOrderIds: ["947033", "b"],
      onInspect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onOpenExternal: vi.fn(),
      onMoveLoadOrder: vi.fn(),
    });
    const items = visibleRowActionItems(entries);
    expect(items.find((item) => item.key === "move-top")?.disabled).toBe(true);
    expect(items.find((item) => item.key === "move-up")?.disabled).toBe(true);
    expect(items.find((item) => item.key === "move-down")?.disabled).toBe(false);
  });
});
