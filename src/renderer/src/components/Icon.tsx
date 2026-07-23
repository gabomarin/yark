import {
  ArrowClockwise,
  CloudArrowDown,
  Copy,
  DotsThreeVertical,
  FileText,
  FolderOpen,
  Gear,
  HardDrives,
  MagnifyingGlass,
  Pause,
  PencilSimple,
  Play,
  Stack,
  StopCircle,
  Terminal,
  Trash,
  UsersThree,
  Warning,
  Circle,
} from "@phosphor-icons/react";

export type IconName =
  | "server"
  | "download"
  | "folder"
  | "play"
  | "pause"
  | "stop"
  | "restart"
  | "update"
  | "logs"
  | "cluster"
  | "status"
  | "settings"
  | "search"
  | "kebab"
  | "warning"
  | "edit"
  | "clone"
  | "delete"
  | "rcon"
  | "players";

type PhosphorIconComponent = typeof Play;

const ICON_COMPONENTS: Record<IconName, PhosphorIconComponent> = {
  server: HardDrives,
  download: CloudArrowDown,
  folder: FolderOpen,
  play: Play,
  pause: Pause,
  stop: StopCircle,
  restart: ArrowClockwise,
  update: CloudArrowDown,
  logs: FileText,
  cluster: Stack,
  status: Circle,
  settings: Gear,
  search: MagnifyingGlass,
  kebab: DotsThreeVertical,
  warning: Warning,
  edit: PencilSimple,
  clone: Copy,
  delete: Trash,
  rcon: Terminal,
  players: UsersThree,
};

interface IconProps {
  name: IconName;
  title?: string;
  className?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}

export function Icon({ name, title, className, weight }: IconProps): JSX.Element {
  const Component = ICON_COMPONENTS[name];
  const combinedClassName = `icon ${className ?? ""}`.trim();

  if (title !== undefined) {
    return (
      <Component
        className={combinedClassName}
        weight={weight ?? "regular"}
        role="img"
        aria-label={title}
      />
    );
  }

  return <Component className={combinedClassName} weight={weight ?? "regular"} aria-hidden="true" />;
}
