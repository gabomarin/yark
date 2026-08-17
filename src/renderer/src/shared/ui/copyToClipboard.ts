import { showOperatorError, showOperatorToast } from "@ui/operatorToast";

export async function copyTextToClipboard(input: {
  text: string;
  /** When true, shows the standard operator success toast (default 5000ms). */
  notifySuccess?: boolean;
  successMessage?: string;
  failureTitle?: string;
  failureMessage?: string;
}): Promise<void> {
  try {
    await navigator.clipboard.writeText(input.text);
    if (input.notifySuccess === true) {
      showOperatorToast({
        title: "Copied",
        message: input.successMessage ?? "Copied to clipboard",
      });
    }
  } catch {
    showOperatorError(
      input.failureMessage ?? "Could not copy to the clipboard",
      input.failureTitle ?? "Copy failed",
    );
  }
}
