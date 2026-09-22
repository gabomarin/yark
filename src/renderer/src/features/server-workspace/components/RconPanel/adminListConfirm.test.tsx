import { describe, expect, it, vi } from "vitest";
import { confirmAdminListRemoval } from "./adminListConfirm";

const { openDangerConfirmModal } = vi.hoisted(() => ({
  openDangerConfirmModal: vi.fn(),
}));

vi.mock("@renderer/shared/ui/DangerConfirmModal/openDangerConfirmModal", () => ({
  dangerConfirmBody: (children: unknown) => children,
  openDangerConfirmModal,
}));

describe("confirmAdminListRemoval", () => {
  it("opens a destructive confirmation and waits for confirmation before removing", () => {
    const onConfirm = vi.fn();

    confirmAdminListRemoval("Alpha", onConfirm);

    expect(openDangerConfirmModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Remove admin?",
        confirmLabel: "Remove",
        onConfirm,
      }),
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
