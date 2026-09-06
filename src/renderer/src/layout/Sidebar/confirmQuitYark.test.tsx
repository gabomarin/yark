import { beforeEach, describe, expect, it, vi } from "vitest";

const openDangerConfirmModal = vi.fn();

vi.mock("@ui/DangerConfirmModal/openDangerConfirmModal", () => ({
  dangerConfirmBody: (children: unknown) => children,
  openDangerConfirmModal: (input: unknown) => openDangerConfirmModal(input),
}));

import { confirmQuitYark } from "./confirmQuitYark";

describe("confirmQuitYark (#532)", () => {
  beforeEach(() => {
    openDangerConfirmModal.mockClear();
  });

  it("opens a danger confirm and quits only on confirm", () => {
    const quitApp = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    window.api = { quitApp } as unknown as typeof window.api;

    confirmQuitYark();

    expect(openDangerConfirmModal).toHaveBeenCalledTimes(1);
    const input = openDangerConfirmModal.mock.calls[0]![0] as {
      title: string;
      confirmLabel: string;
      onConfirm: () => void;
    };
    expect(input.title).toBe("Quit YARK?");
    expect(input.confirmLabel).toBe("Quit YARK");
    expect(quitApp).not.toHaveBeenCalled();

    input.onConfirm();
    expect(quitApp).toHaveBeenCalledTimes(1);
  });
});
