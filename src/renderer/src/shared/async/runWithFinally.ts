/**
 * Async try/finally helper for busy flags and generation guards.
 * Lives outside React components so babel-plugin-react-compiler does not
 * bail out on try/finally inside component bodies (#404 follow-up).
 */
export async function runWithFinally<T>(
  fn: () => Promise<T>,
  cleanup: () => void,
): Promise<T> {
  try {
    return await fn();
  } finally {
    cleanup();
  }
}
