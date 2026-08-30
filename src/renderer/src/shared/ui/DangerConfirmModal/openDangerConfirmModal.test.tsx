import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenConfirmModal } from "@mantine/modals";

const openConfirmModal = vi.fn((_options: OpenConfirmModal) => "modal-id");

vi.mock("@mantine/modals", () => ({
  modals: {
    openConfirmModal: (options: OpenConfirmModal) => openConfirmModal(options),
  },
}));

import {
  DANGER_CONFIRM_CANCEL_LABEL,
  dangerConfirmBody,
  openDangerConfirmModal,
} from "./openDangerConfirmModal";

describe("openDangerConfirmModal", () => {
  beforeEach(() => {
    openConfirmModal.mockClear();
  });

  it("forces red confirm color and Cancel label defaults", () => {
    const onConfirm = vi.fn();
    const id = openDangerConfirmModal({
      title: "Delete backup?",
      children: dangerConfirmBody("Permanently delete this backup?"),
      confirmLabel: "Delete",
      onConfirm,
    });

    expect(id).toBe("modal-id");
    expect(openConfirmModal).toHaveBeenCalledTimes(1);
    const options = openConfirmModal.mock.calls[0]![0];
    expect(options.title).toBe("Delete backup?");
    expect(options.labels).toEqual({
      confirm: "Delete",
      cancel: DANGER_CONFIRM_CANCEL_LABEL,
    });
    expect(options.confirmProps?.color).toBe("red");
    expect(options.onConfirm).toBe(onConfirm);
  });

  it("merges confirmProps but keeps color red", () => {
    openDangerConfirmModal({
      title: "Clear?",
      children: "body",
      confirmLabel: "Clear",
      cancelLabel: "Keep",
      confirmProps: { loading: true },
      onConfirm: () => undefined,
    });

    const options = openConfirmModal.mock.calls[0]![0];
    expect(options.labels?.cancel).toBe("Keep");
    expect(options.confirmProps).toEqual({ loading: true, color: "red" });
  });

  it("dangerConfirmBody wraps children in Text size sm", () => {
    const node = dangerConfirmBody("Hello");
    expect(node).toMatchObject({
      props: { size: "sm", children: "Hello" },
    });
  });
});
