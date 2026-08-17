import { showOperatorError, showOperatorToast } from "@ui/operatorToast";

export async function copyTextToClipboard(input: {
  text: string;
  successMessage: string;
  failureTitle?: string;
  failureMessage?: string;
}): Promise<void> {
  try {
    await navigator.clipboard.writeText(input.text);
    showOperatorToast({
      title: "Copied",
      message: input.successMessage,
      autoClose: 1500,
    });
  } catch {
    showOperatorError(
      input.failureMessage ?? "Could not copy to the clipboard",
      input.failureTitle ?? "Copy failed",
    );
  }
}
