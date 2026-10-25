import { useState, type ReactElement } from "react";
import { Button, Group, NumberInput, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { Shuffle } from "@phosphor-icons/react";
import { lookupAsaItem } from "@shared/asa/asa-item-catalog";
import { lookupSupplyCrate } from "@shared/asa/asa-supply-crate-catalog";
import {
  openSupplyCrate,
  simulateSupplyCrate,
  supplyCrateRollIgnoresPower,
  type SupplyCrateOpening,
  type SupplyCrateSimulation,
} from "@shared/ini/supply-crate-simulator";
import type { SupplyCrateBody } from "@shared/ini/supply-crate-entries";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";

interface Props {
  body: SupplyCrateBody | null;
  selectionKey: string | null;
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function itemLabel(className: string): string {
  return lookupAsaItem(className)?.label ?? className;
}

function randomSeed(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] ?? 1;
}

function boundedInteger(value: number | string, min: number, max: number): number | null {
  if (typeof value === "string" && value.trim().length === 0) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) return null;
  return numeric;
}

function blueprintLabel(quantity: number, blueprints: number): string | null {
  if (blueprints <= 0) return null;
  if (blueprints >= quantity) return "Blueprint";
  return blueprints === 1 ? "1 blueprint" : `${blueprints} blueprints`;
}

/** Rolls the selected override. It does not write the file. */
export function LootSimulatorPanel(props: Props): ReactElement {
  const [rolls, setRolls] = useState<number | string>(100);
  const [seed, setSeed] = useState<number | string>(1);
  const [opening, setOpening] = useState<SupplyCrateOpening | null>(null);
  const [result, setResult] = useState<SupplyCrateSimulation | null>(null);
  const [seenKey, setSeenKey] = useState(props.selectionKey);
  if (seenKey !== props.selectionKey) {
    setSeenKey(props.selectionKey);
    setOpening(null);
    setResult(null);
  }

  const open = (): void => {
    if (props.body === null) return;
    const nextSeed = boundedInteger(seed, 0, 4294967295);
    if (nextSeed === null) return;
    setOpening(openSupplyCrate(props.body, nextSeed));
  };

  const roll = (): void => {
    if (props.body === null) return;
    const nextSeed = boundedInteger(seed, 0, 4294967295);
    const nextRolls = boundedInteger(rolls, 1, 500);
    if (nextSeed === null || nextRolls === null) return;
    setResult(
      simulateSupplyCrate(props.body, {
        rolls: nextRolls,
        seed: nextSeed,
      }),
    );
  };

  if (props.body === null) {
    return (
      <Text size="sm" c="dimmed">
        Select a crate. One open shows that drop. Many opens shows how often each item appears.
      </Text>
    );
  }

  const label = lookupSupplyCrate(props.body.className)?.label ?? props.body.className;
  const seedValue = boundedInteger(seed, 0, 4294967295);
  const rollValue = boundedInteger(rolls, 1, 500);
  const ignoresPower = supplyCrateRollIgnoresPower(props.body);

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={2}>
          <Text fw={600}>{label}</Text>
          <Text size="xs" c="dimmed">
            {props.body.className}
          </Text>
        </Stack>
        <Group align="flex-end">
          <NumberInput
            label="Seed"
            size="xs"
            min={0}
            max={4294967295}
            value={seed}
            onChange={setSeed}
            w={140}
            error={seedValue === null ? "Enter a whole number from 0 to 4294967295." : undefined}
          />
          <Button size="xs" variant="default" leftSection={<Shuffle size={14} />} onClick={() => setSeed(randomSeed())}>
            Random seed
          </Button>
        </Group>
      </Group>
      {ignoresPower ? (
        <Text size="sm">
          Set quality power and item quality power are not part of this roll. Counts are an even chance between the
          minimum and the maximum.
        </Text>
      ) : null}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <AppSurfaceCard tone="flat" padding="sm">
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              One open
            </Text>
            <Text size="xs" c="dimmed">
              The items from one opened crate with this seed.
            </Text>
            <Button size="xs" w="fit-content" disabled={seedValue === null} onClick={open}>
              Open crate
            </Button>
            {opening?.shortfall === true ? (
              <Text size="sm">This open stopped early because no set or item was left.</Text>
            ) : null}
            {opening === null ? (
              <Text size="sm" c="dimmed">
                Open this crate to see the drop.
              </Text>
            ) : null}
            {opening !== null && opening.items.length === 0 ? (
              <Text size="sm" c="dimmed">
                This open produced no items.
              </Text>
            ) : null}
            {opening?.items.map((item, index) => {
              const blueprint = blueprintLabel(item.quantity, item.blueprints);
              return (
                <Stack key={`${item.className}:${item.quantity}:${item.blueprints}:${index}`} gap={0}>
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="sm" truncate>
                      {itemLabel(item.className)}
                    </Text>
                    <Text size="sm">× {formatQuantity(item.quantity)}</Text>
                  </Group>
                  <Text size="xs" c="dimmed" truncate>
                    {blueprint === null ? item.className : `${item.className} · ${blueprint}`}
                  </Text>
                </Stack>
              );
            })}
          </Stack>
        </AppSurfaceCard>
        <AppSurfaceCard tone="flat" padding="sm">
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Many opens
            </Text>
            <Text size="xs" c="dimmed">
              Qty per drop is the average amount each time that item appears.
            </Text>
            <Group align="flex-end">
              <NumberInput
                label="Rolls"
                size="xs"
                min={1}
                max={500}
                value={rolls}
                onChange={setRolls}
                w={100}
                error={rollValue === null ? "Enter a whole number from 1 to 500." : undefined}
              />
              <Button size="xs" variant="default" disabled={seedValue === null || rollValue === null} onClick={roll}>
                Roll crate
              </Button>
            </Group>
            {result?.shortfall === true ? (
              <Text size="sm">A roll stopped early because no set or item was left.</Text>
            ) : null}
            {result === null ? (
              <Text size="sm" c="dimmed">
                Roll this crate to see how often each item appears.
              </Text>
            ) : null}
            {result !== null && result.classes.length === 0 ? (
              <Text size="sm" c="dimmed">
                This roll produced no items.
              </Text>
            ) : null}
            {result !== null && result.classes.length > 0 ? (
              <Table.ScrollContainer minWidth={360}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Item</Table.Th>
                      <Table.Th>Times</Table.Th>
                      <Table.Th>Qty per drop</Table.Th>
                      <Table.Th>Blueprints</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.classes.map((row) => (
                      <Table.Tr key={row.className}>
                        <Table.Td>
                          <Text size="sm" truncate title={row.className}>
                            {itemLabel(row.className)}
                          </Text>
                        </Table.Td>
                        <Table.Td>{row.appearances}</Table.Td>
                        <Table.Td>{formatQuantity(row.meanQuantity)}</Table.Td>
                        <Table.Td>{row.blueprintCount}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : null}
          </Stack>
        </AppSurfaceCard>
      </SimpleGrid>
    </Stack>
  );
}
