import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort renderer crash chrome. Must not depend on Mantine/theme — those
 * providers may be what threw (blank navy window otherwise).
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("YARK renderer crashed", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    const message = this.state.error.message || "Unknown error";
    return (
      <div
        role="alert"
        data-app-error-boundary
        style={{
          minHeight: "100vh",
          margin: 0,
          padding: 32,
          boxSizing: "border-box",
          background: "#010306",
          color: "#e6effd",
          fontFamily: '"Segoe UI", Arial, sans-serif',
        }}
      >
        <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>YARK hit an error</h1>
        <p style={{ color: "#9aa3b5", maxWidth: 560, lineHeight: 1.45 }}>
          The window stayed open so you can reload. Your servers are not stopped from this screen.
        </p>
        <p
          style={{
            color: "#9aa3b5",
            fontSize: 13,
            wordBreak: "break-word",
            maxWidth: 640,
          }}
        >
          {message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 16,
            padding: "8px 14px",
            border: "none",
            borderRadius: 8,
            background: "#3b8cff",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload YARK
        </button>
      </div>
    );
  }
}
