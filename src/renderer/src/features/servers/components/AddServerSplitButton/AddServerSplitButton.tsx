import type { ReactElement } from "react";
import { CaretDown, Plus } from "@phosphor-icons/react";
import { Button, Menu } from "@mantine/core";

interface Props {
  /** Primary action label (e.g. New server / Add server). */
  primaryLabel: string;
  onCreate: () => void;
  onImport: () => void;
  /** Compact footer variant for workspace rail. */
  fullWidth?: boolean;
  size?: "xs" | "sm" | "md";
  /**
   * When demoted (e.g. empty Overview where EmptyState owns the filled CTA),
   * both halves use `default` so header create is not a second filled primary (#236).
   */
  emphasis?: "primary" | "secondary";
  /** Accessible name for the chevron menu trigger. */
  menuAriaLabel?: string;
}

/**
 * GitHub-style split control: primary create + chevron for Import install (#254).
 */
export function AddServerSplitButton(props: Props): ReactElement {
  const size = props.size ?? "sm";
  const menuAriaLabel = props.menuAriaLabel ?? "More add-server options";
  const variant = props.emphasis === "secondary" ? "default" : undefined;

  return (
    <Button.Group>
      <Button
        size={size}
        variant={variant}
        leftSection={<Plus size={16} />}
        onClick={props.onCreate}
        style={props.fullWidth ? { flex: 1 } : undefined}
      >
        {props.primaryLabel}
      </Button>
      <Menu shadow="md" withinPortal position="bottom-end">
        <Menu.Target>
          <Button
            size={size}
            variant={variant}
            px="xs"
            aria-label={menuAriaLabel}
            style={props.fullWidth ? { flex: "0 0 auto" } : undefined}
          >
            <CaretDown size={14} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={props.onImport}>Import install</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Button.Group>
  );
}
