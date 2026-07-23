type IconName = "server" | "download" | "folder" | "play" | "stop" | "update" | "logs" | "cluster" | "status";

interface IconProps {
  name: IconName;
  title?: string;
  className?: string;
}

const ICON_PATHS: Record<IconName, JSX.Element> = {
  server: (
    <path d="M4 6h16v5H4zM4 13h16v5H4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  ),
  download: (
    <path d="M12 3v10m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  ),
  folder: (
    <path d="M3.5 7.5h4.4l1.6 2H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  ),
  play: (
    <path d="M9 6.5v11l9-5.5-9-5.5Z" fill="currentColor" />
  ),
  stop: (
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
  ),
  update: (
    <path d="M6 12a6 6 0 0 1 10.2-4.2L18 9M18 9V5m0 4h-4M18 12a6 6 0 0 1-10.2 4.2L6 15m0 0v4m0-4h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  ),
  logs: (
    <path d="M6 4.5h12v15H6zM8.5 8h7M8.5 11.5h7M8.5 15h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  ),
  cluster: (
    <path d="M7 7h4v4H7zM13 7h4v4h-4zM10 13h4v4h-4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  ),
  status: (
    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
  ),
};

export function Icon({ name, title, className }: IconProps): JSX.Element {
  if (title !== undefined) {
    return (
      <svg className={`icon ${className ?? ""}`.trim()} viewBox="0 0 24 24" role="img" focusable="false">
        <title>{title}</title>
        {ICON_PATHS[name]}
      </svg>
    );
  }

  return (
    <svg
      className={`icon ${className ?? ""}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}