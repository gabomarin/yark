import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminListStateDto } from "@shared/ipc";
import { resetHostedResourceOptionsSnapshot } from "@features/hosted-resources/hooks/useHostedResourceOptions";
import { notifyHostedResourcesDiagnosticsUpdated } from "@features/hosted-resources/hooks/useHostedResourcesHealth";
import { useAdminsSection } from "./useAdminsSection";
import { runAdminListEditMember, useAdminListMembership } from "./useAdminListMembership";

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

const remoteState = (overrides: Partial<AdminListStateDto> = {}): AdminListStateDto => ({
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

const loopbackState = (overrides: Partial<AdminListStateDto> = {}): AdminListStateDto => ({
  mode: "loopback",
  adminListUrl: "http://127.0.0.1:8935/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  updateAllowedCheatersInterval: 600,
  entries: [{ id: "0002e03af5f4487985e94c6ba4080369", name: "Alpha" }],
  listError: null,
  filePath: "C:\\ARK\\ShooterGame\\Saved\\AllowedCheaterAccountIDs.txt",
  fileExists: true,
  fileByteLength: 0,
  ...overrides,
});

describe("useAdminsSection", () => {
  beforeEach(() => {
    resetHostedResourceOptionsSnapshot();
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
      getHostedResourcesOverview: vi.fn(async () => ({
        ok: true as const,
        data: {
          state: { enabled: true },
          resources: [
            {
              id: "res-1",
              displayName: "Admins",
              url: "http://127.0.0.1:8935/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              enabled: true,
              kind: "admin-list",
              publishedRevisionId: "rev-1",
            },
          ],
        },
      })),
      editAdminListMember: vi.fn(async () => ({
        ok: true as const,
        data: loopbackState(),
      })),
    } as unknown as typeof window.api;
  });

  afterEach(() => {
    cleanup();
  });

  it("marks draft dirty when URL or interval change and clears dirty after discard", async () => {
    const { result } = renderHook(() => useAdminsSection({ serverId: "srv-1", iniDirty: false }));

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
    const { result } = renderHook(() => useAdminsSection({ serverId: "srv-1", iniDirty: true }));

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

    const nameById = new Map([["0002e03af5f4487985e94c6ba4080369", "Alpha"]]);

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

  it("shows a loopback AdminListURL in the field and keeps it after save (#564)", async () => {
    const loopbackUrl = "http://127.0.0.1:8935/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    vi.mocked(window.api.getAdminList).mockResolvedValue({
      ok: true,
      data: remoteState({ mode: "loopback", adminListUrl: loopbackUrl }),
    });

    const { result } = renderHook(() => useAdminsSection({ serverId: "srv-1", iniDirty: false }));

    await waitFor(() => {
      expect(result.current.urlDraft).toBe(loopbackUrl);
    });
    expect(result.current.draftDirty).toBe(false);

    act(() => {
      result.current.setIntervalDraft(30);
    });
    await act(async () => {
      await result.current.saveConfig();
    });
    expect(window.api.setAdminList).toHaveBeenCalledWith("srv-1", {
      adminListUrl: loopbackUrl,
      updateAllowedCheatersInterval: 30,
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

  it("is editable for a loopback URL served by a compatible hosted resource and removes a member", async () => {
    const before = loopbackState();
    const after = loopbackState({
      entries: [{ id: "0002aaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: null }],
    });
    // The hook reloads on the diagnostics broadcast after an edit, so a later read must reflect
    // the applied change (as the real backend does) instead of replaying the pre-edit list.
    let current = before;
    vi.mocked(window.api.getAdminList).mockImplementation(async () => ({ ok: true, data: current }));
    vi.mocked(window.api.editAdminListMember).mockImplementation(async () => {
      current = after;
      return { ok: true, data: after };
    });

    const { result } = renderHook(() => useAdminsSection({ serverId: "srv-1", iniDirty: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    await waitFor(() => {
      expect(result.current.editable).toBe(true);
    });

    act(() => {
      void result.current.editMember("0002e03af5f4487985e94c6ba4080369", "remove");
    });

    await waitFor(() => {
      expect(window.api.editAdminListMember).toHaveBeenCalledWith(
        "srv-1",
        "0002e03af5f4487985e94c6ba4080369",
        "remove",
        undefined,
      );
    });
    await waitFor(() => {
      expect(result.current.busyKey).toBeNull();
    });
    expect(result.current.state?.entries.map((entry) => entry.id)).toEqual(["0002aaaaaaaaaaaaaaaaaaaaaaaaaaaa"]);
    expect(showOperatorToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Saved. ASA re-checks this list every 600s — no restart needed.",
        color: "ok",
      }),
    );
  });

  it("is not editable for a remote list even when hosted resources load", async () => {
    vi.mocked(window.api.getAdminList).mockResolvedValue({
      ok: true,
      data: remoteState(),
    });

    const { result } = renderHook(() => useAdminsSection({ serverId: "srv-1", iniDirty: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    await waitFor(() => {
      expect(result.current.editable).toBe(false);
    });
  });

  it("never counts ids from the local AllowedCheaterAccountIDs.txt file as admins", async () => {
    vi.mocked(window.api.getAdminList).mockResolvedValue({
      ok: true,
      data: {
        mode: "local",
        adminListUrl: "",
        updateAllowedCheatersInterval: 600,
        entries: [{ id: "0002e03af5f4487985e94c6ba4080369", name: null }],
        listError: null,
        filePath: "C:\\ARK\\ShooterGame\\Saved\\AllowedCheaterAccountIDs.txt",
        fileExists: true,
        fileByteLength: 10,
      },
    });

    const { result } = renderHook(() => useAdminListMembership("srv-1"));

    await waitFor(() => {
      expect(result.current.editable).toBe(false);
    });
    expect(result.current.isMember("0002e03af5f4487985e94c6ba4080369")).toBe(false);
  });

  it("useAdminListMembership matches ids case-insensitively and forwards the name on add", async () => {
    const after = loopbackState({
      entries: [
        { id: "0002e03af5f4487985e94c6ba4080369", name: "Alpha" },
        { id: "0002dddddddddddddddddddddddddddddd", name: "Bravo" },
      ],
    });
    vi.mocked(window.api.getAdminList)
      .mockResolvedValueOnce({ ok: true, data: loopbackState() })
      .mockResolvedValue({ ok: true, data: after });
    vi.mocked(window.api.editAdminListMember).mockResolvedValue({ ok: true, data: after });

    const { result } = renderHook(() => useAdminListMembership("srv-1"));

    await waitFor(() => {
      expect(result.current.editable).toBe(true);
    });
    expect(result.current.isMember("0002E03AF5F4487985E94C6BA4080369")).toBe(true);
    expect(result.current.isMember("0002aaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);

    act(() => {
      void result.current.editMember("0002dddddddddddddddddddddddddddddd", "add", "Bravo");
    });

    await waitFor(() => {
      expect(window.api.editAdminListMember).toHaveBeenCalledWith(
        "srv-1",
        "0002dddddddddddddddddddddddddddddd",
        "add",
        "Bravo",
      );
    });
    await waitFor(() => {
      expect(result.current.busyKey).toBeNull();
    });
    expect(result.current.isMember("0002dddddddddddddddddddddddddddddd")).toBe(true);
  });

  it("reloads membership when another admin-list editor publishes an update", async () => {
    const memberId = "0002e03af5f4487985e94c6ba4080369";
    vi.mocked(window.api.getAdminList)
      .mockResolvedValueOnce({ ok: true, data: loopbackState() })
      .mockResolvedValueOnce({ ok: true, data: loopbackState({ entries: [] }) });

    const { result } = renderHook(() => useAdminListMembership("srv-1"));

    await waitFor(() => {
      expect(result.current.isMember(memberId)).toBe(true);
    });

    act(() => {
      notifyHostedResourcesDiagnosticsUpdated();
    });

    await waitFor(() => {
      expect(window.api.getAdminList).toHaveBeenCalledTimes(2);
      expect(result.current.isMember(memberId)).toBe(false);
    });
  });

  it("refreshes the Admins tab entries when another editor publishes an update", async () => {
    vi.mocked(window.api.getAdminList)
      .mockResolvedValueOnce({ ok: true, data: loopbackState() })
      .mockResolvedValueOnce({ ok: true, data: loopbackState({ entries: [] }) });

    const { result } = renderHook(() => useAdminsSection({ serverId: "srv-1", iniDirty: false }));
    await waitFor(() => {
      expect(result.current.state?.entries).toHaveLength(1);
    });

    act(() => {
      notifyHostedResourcesDiagnosticsUpdated();
    });

    await waitFor(() => {
      expect(result.current.state?.entries).toHaveLength(0);
    });
  });

  it("keeps pending URL/interval drafts when another editor refreshes the entries", async () => {
    vi.mocked(window.api.getAdminList)
      .mockResolvedValueOnce({ ok: true, data: loopbackState() })
      .mockResolvedValueOnce({ ok: true, data: loopbackState({ entries: [] }) });

    const { result } = renderHook(() => useAdminsSection({ serverId: "srv-1", iniDirty: false }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setUrlDraft("https://example.com/pending.txt");
    });
    expect(result.current.draftDirty).toBe(true);

    act(() => {
      notifyHostedResourcesDiagnosticsUpdated();
    });

    await waitFor(() => {
      expect(result.current.state?.entries).toHaveLength(0);
    });
    expect(result.current.urlDraft).toBe("https://example.com/pending.txt");
    expect(result.current.draftDirty).toBe(true);
  });

  it("resolves runAdminListEditMember to true on success and false on a reported error", async () => {
    const setBusyKey = vi.fn();
    const onSuccess = vi.fn();

    vi.mocked(window.api.editAdminListMember).mockResolvedValueOnce({
      ok: true as const,
      data: loopbackState(),
    });
    await expect(
      runAdminListEditMember({ serverId: "srv-1", id: "x", action: "add", setBusyKey, onSuccess }),
    ).resolves.toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    vi.mocked(window.api.editAdminListMember).mockResolvedValueOnce({
      ok: false as const,
      error: "AdminListURL does not point at a current YARK Hosted Resource",
    });
    await expect(
      runAdminListEditMember({ serverId: "srv-1", id: "y", action: "add", setBusyKey, onSuccess }),
    ).resolves.toBe(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
