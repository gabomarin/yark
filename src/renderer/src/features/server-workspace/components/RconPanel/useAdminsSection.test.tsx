import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminListStateDto } from "@shared/ipc";
import { useAdminsSection } from "./useAdminsSection";

const { showOperatorToast } = vi.hoisted(() => ({
  showOperatorToast: vi.fn(),
}));

vi.mock("@ui/operatorToast", () => ({
  showOperatorError: vi.fn(),
  showOperatorToast,
}));

const emptyState = (): AdminListStateDto => ({
  mode: "local",
  adminListUrl: "",
  updateAllowedCheatersInterval: 600,
  entries: [],
  listError: null,
  filePath: "C:\\ARK\\ShooterGame\\Saved\\AllowedCheaterAccountIDs.txt",
  fileExists: true,
  fileByteLength: 0,
});

const remoteState = (
  overrides: Partial<AdminListStateDto> = {},
): AdminListStateDto => ({
  mode: "remote",
  adminListUrl: "https://example.com/admins.txt",
  updateAllowedCheatersInterval: 600,
  entries: [{ id: "0002e03af5f4487985e94c6ba4080369", name: null }],
  listError: null,
  filePath: "C:\\ARK\\ShooterGame\\Saved\\AllowedCheaterAccountIDs.txt",
  fileExists: true,
  fileByteLength: 0,
  ...overrides,
});

describe("useAdminsSection", () => {
  beforeEach(() => {
    showOperatorToast.mockClear();
    window.api = {
      getAdminList: vi.fn(async () => ({
        ok: true as const,
        data: emptyState(),
      })),
      setAdminList: vi.fn(async (_id, config) => ({
        ok: true as const,
        data: remoteState({
          adminListUrl: config.adminListUrl,
          updateAllowedCheatersInterval: config.updateAllowedCheatersInterval,
          entries: [],
        }),
      })),
      validateAdminListUrl: vi.fn(),
      learnAdminListNames: vi.fn(async () => ({
        ok: true as const,
        data: { updated: 1 },
      })),
    } as unknown as typeof window.api;
  });

  afterEach(() => {
    cleanup();
  });

  it("marks draft dirty when URL or interval change and clears dirty after discard", async () => {
    const { result } = renderHook(() =>
      useAdminsSection({ serverId: "srv-1", iniDirty: false }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.draftDirty).toBe(false);

    act(() => {
      result.current.setUrlDraft("https://example.com/list.txt");
    });
    expect(result.current.draftDirty).toBe(true);

    act(() => {
      result.current.discardDraft();
    });
    expect(result.current.draftDirty).toBe(false);
    expect(result.current.urlDraft).toBe("");

    act(() => {
      result.current.setIntervalDraft(120);
    });
    expect(result.current.draftDirty).toBe(true);

    act(() => {
      result.current.discardDraft();
    });
    expect(result.current.draftDirty).toBe(false);
    expect(result.current.intervalDraft).toBe(600);
  });

  it("saveConfig no-ops when iniDirty is true", async () => {
    const { result } = renderHook(() =>
      useAdminsSection({ serverId: "srv-1", iniDirty: true }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setUrlDraft("https://example.com/list.txt");
    });

    await act(async () => {
      await result.current.saveConfig();
    });

    expect(window.api.setAdminList).not.toHaveBeenCalled();
    expect(showOperatorToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Save or discard INI Files changes first.",
      }),
    );
  });

  it("learns display names when nameById updates for current ids", async () => {
    vi.mocked(window.api.getAdminList).mockResolvedValue({
      ok: true,
      data: remoteState(),
    });

    const nameById = new Map([
      ["0002e03af5f4487985e94c6ba4080369", "Alpha"],
    ]);

    const { result } = renderHook(() =>
      useAdminsSection({
        serverId: "srv-1",
        iniDirty: false,
        nameById,
      }),
    );

    await waitFor(() => {
      expect(window.api.learnAdminListNames).toHaveBeenCalledWith("srv-1", [
        { id: "0002e03af5f4487985e94c6ba4080369", name: "Alpha" },
      ]);
    });

    await waitFor(() => {
      expect(result.current.state?.entries[0]?.name).toBe("Alpha");
    });
  });

  it("registers reloadRef with the load function", async () => {
    const reloadRef = { current: null as (() => Promise<void>) | null };
    renderHook(() =>
      useAdminsSection({
        serverId: "srv-1",
        iniDirty: false,
        reloadRef,
      }),
    );

    await waitFor(() => {
      expect(reloadRef.current).toEqual(expect.any(Function));
    });

    vi.mocked(window.api.getAdminList).mockClear();
    await act(async () => {
      await reloadRef.current?.();
    });
    expect(window.api.getAdminList).toHaveBeenCalledWith("srv-1");
  });
});
