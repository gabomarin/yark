import { notifications } from "@mantine/notifications";

/** Shared operator toast channel (design-system §5c). */
export function showOperatorToast(input: {
  title: string;
  message: string;
  color?: string;
  autoClose?: number | false;
  /** Stable id replaces an existing toast with the same id. */
  id?: string;
  onClick?: () => void;
}): void {
  notifications.show({
    id: input.id,
    title: input.title,
    message: input.message,
    color: input.color ?? "teal",
    autoClose: input.autoClose ?? 5000,
    withCloseButton: true,
    onClick: input.onClick,
  });
}

export function showOperatorError(
  message: string,
  title = "Something went wrong",
): void {
  showOperatorToast({
    title,
    message,
    color: "red",
    autoClose: 8000,
  });
}
