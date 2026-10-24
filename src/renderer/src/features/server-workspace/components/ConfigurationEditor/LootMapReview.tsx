import { useState, type ReactElement } from "react";
import { Button, Checkbox, Group, Stack, Text } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { supplyCrateFitLabel, supplyCrateRemovable, type SupplyCrateFit } from "@shared/asa/asa-supply-crate-catalog";

interface LootMapReviewRow {
  key: string;
  label: string;
  className: string;
  fit: SupplyCrateFit;
}

interface Props {
  mapLabel: string;
  rows: readonly LootMapReviewRow[];
  onKeep: () => void;
  onRemove: (keys: readonly string[]) => void;
}

/** Default action is Keep all. Nothing is deleted because the map changed. */
export function LootMapReview(props: Props): ReactElement {
  const removable = props.rows.filter((row) => supplyCrateRemovable(row.fit));
  const [checked, setChecked] = useState<string[]>([]);
  const unused = props.rows.filter((row) => row.fit === "unused").length;
  const unknown = props.rows.filter((row) => row.fit === "unknown").length;

  return (
    <AppAlert color="attention" title={`${props.mapLabel} uses a different set of crates`}>
      <Stack gap="xs">
        <Text size="sm">
          {unused} unused, {unknown} unknown. Keep all leaves every override. Only checked crates are removed, and the
          crate in the game stays.
        </Text>
        {removable.map((row) => (
          <Checkbox
            key={row.key}
            size="xs"
            label={`${row.label} · ${supplyCrateFitLabel(row.fit)}`}
            checked={checked.includes(row.key)}
            onChange={(event) =>
              setChecked((current) =>
                event.currentTarget.checked ? [...current, row.key] : current.filter((key) => key !== row.key),
              )
            }
          />
        ))}
        <Group>
          <Button size="xs" variant="default" onClick={props.onKeep}>
            Keep all
          </Button>
          <Button size="xs" color="red" disabled={checked.length === 0} onClick={() => props.onRemove(checked)}>
            Remove selected
          </Button>
        </Group>
      </Stack>
    </AppAlert>
  );
}
