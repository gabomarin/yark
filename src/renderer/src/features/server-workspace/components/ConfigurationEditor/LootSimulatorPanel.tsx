import { useState, type ReactElement } from "react";
import { Button, Group, NumberInput, Stack, Table, Text } from "@mantine/core";
import { simulateSupplyCrate, type SupplyCrateSimulation } from "@shared/ini/supply-crate-simulator";
import type { SupplyCrateBody } from "@shared/ini/supply-crate-entries";

interface Props {
  body: SupplyCrateBody | null;
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Rolls the selected override. It does not write the file. */
export function LootSimulatorPanel(props: Props): ReactElement {
  const [rolls, setRolls] = useState<number | string>(100);
  const [seed, setSeed] = useState<number | string>(1);
  const [result, setResult] = useState<SupplyCrateSimulation | null>(null);

  const roll = (): void => {
    if (props.body === null) return;
    const rollCount = typeof rolls === "number" ? rolls : Number(rolls);
    const rollSeed = typeof seed === "number" ? seed : Number(seed);
    setResult(
      simulateSupplyCrate(props.body, {
        rolls: Number.isFinite(rollCount) ? rollCount : 1,
        seed: Number.isFinite(rollSeed) ? rollSeed : 1,
      }),
    );
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        One roll is one opened crate. Chance is the weight divided by the sum of the weights. This does not change the
        file.
      </Text>
      <Group align="flex-end">
        <NumberInput label="Rolls" size="xs" min={1} max={500} value={rolls} onChange={setRolls} w={100} />
        <NumberInput label="Seed" size="xs" value={seed} onChange={setSeed} w={120} />
        <Button size="xs" disabled={props.body === null} onClick={roll}>
          Roll crate
        </Button>
      </Group>
      {props.body === null ? (
        <Text size="sm" c="dimmed">
          Select a crate to roll it.
        </Text>
      ) : null}
      {result?.incomplete === true ? (
        <Text size="sm">This roll does not include the game's own items for this crate.</Text>
      ) : null}
      {result?.shortfall === true ? <Text size="sm">A roll stopped early because no set or item was left.</Text> : null}
      {result !== null && result.classes.length === 0 ? (
        <Text size="sm" c="dimmed">
          This roll produced no items.
        </Text>
      ) : null}
      {result !== null && result.classes.length > 0 ? (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Item</Table.Th>
              <Table.Th>Times</Table.Th>
              <Table.Th>Mean quantity</Table.Th>
              <Table.Th>Blueprints</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.classes.map((row) => (
              <Table.Tr key={row.className}>
                <Table.Td>{row.className}</Table.Td>
                <Table.Td>{row.appearances}</Table.Td>
                <Table.Td>{formatQuantity(row.meanQuantity)}</Table.Td>
                <Table.Td>{row.blueprintCount}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : null}
    </Stack>
  );
}
