import type { ReactElement } from "react";
import {
  ArrowDown,
  ArrowSquareOut,
  ArrowUp,
  DotsSixVertical,
  MagnifyingGlass,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ModMetadata, ServerProfile } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import classes from "./ModsManager.module.css";

interface Props {
  server: ServerProfile;
  onModsChanged: (mods: string[]) => Promise<void>;
}

export function ModsManager(props: Props): ReactElement {
  const [mods, setMods] = useState<string[]>(props.server.mods);
  const [metadataById, setMetadataById] = useState<Map<string, ModMetadata>>(
    new Map(),
  );
  const [modDraft, setModDraft] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, { open: openDetail, close: closeDetail }] = useDisclosure(false);

  useEffect(() => {
    setMods(props.server.mods);
  }, [props.server.id, props.server.mods, props.server.updatedAt]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (mods.length === 0) {
        setMetadataById(new Map());
        return;
      }
      setLoadingMeta(true);
      const result = await window.api.getModsMetadata(mods);
      if (!alive) return;
      setLoadingMeta(false);
      if (!result.ok) {
        setError(result.error ?? "Could not load mod metadata");
        return;
      }
      setMetadataById(new Map(result.data.map((item) => [item.id, item])));
    };
    void load();
    return () => {
      alive = false;
    };
  }, [mods]);

  const filteredMods = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) return mods;
    return mods.filter((id) => {
      const meta = metadataById.get(id);
      return (
        id.includes(query) ||
        (meta?.name.toLowerCase().includes(query) ?? false) ||
        (meta?.authors.some((author) => author.toLowerCase().includes(query)) ??
          false)
      );
    });
  }, [metadataById, mods, search]);

  const selectedMeta =
    selectedId === null ? null : (metadataById.get(selectedId) ?? null);

  const persist = async (next: string[]) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await props.onModsChanged(next);
      setMods(next);
      setInfo("Mods updated in the profile (−mods= on launch).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save mods");
    } finally {
      setBusy(false);
    }
  };

  const addMod = async () => {
    const id = modDraft.trim();
    if (id.length === 0) return;
    if (mods.includes(id)) {
      setError(`Mod ${id} is already in the list.`);
      return;
    }
    setBusy(true);
    setError(null);
    const metaResult = await window.api.getModMetadata(id);
    setBusy(false);
    if (!metaResult.ok) {
      setError(metaResult.error ?? "Invalid mod ID");
      return;
    }
    setMetadataById((previous) => {
      const next = new Map(previous);
      next.set(metaResult.data.id, metaResult.data);
      return next;
    });
    setModDraft("");
    await persist([...mods, id]);
  };

  const moveMod = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= mods.length) return;
    const next = [...mods];
    const current = next[index];
    const swap = next[target];
    if (current === undefined || swap === undefined) return;
    next[index] = swap;
    next[target] = current;
    await persist(next);
  };

  const removeMod = async (modId: string) => {
    const next = mods.filter((id) => id !== modId);
    if (selectedId === modId) {
      setSelectedId(null);
      closeDetail();
    }
    await persist(next);
  };

  const openModDetail = (modId: string) => {
    setSelectedId(modId);
    openDetail();
  };

  return (
    <div className={classes.root}>
      <header className={classes.header}>
        <div>
          <Title order={3}>Mods</Title>
          <Text c="dimmed" size="sm">
            Manage CurseForge Project IDs. They are injected into{" "}
            <Text span fw={600}>
              -mods=
            </Text>{" "}
            on launch. Local stub metadata until an API key is available.
          </Text>
        </div>
      </header>

      <div className={classes.content}>
        {error !== null && (
          <Alert color="red" withCloseButton onClose={() => setError(null)} mb="sm">
            {error}
          </Alert>
        )}
        {info !== null && (
          <Alert color="blue" withCloseButton onClose={() => setInfo(null)} mb="sm">
            {info}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mb="md">
          <div className={classes.statCard}>
            <Text c="dimmed" size="xs">
              Mods in profile
            </Text>
            <Text fw={700} size="xl" c="teal.4">
              {mods.length}
            </Text>
          </div>
          <div className={classes.statCard}>
            <Text c="dimmed" size="xs">
              With known name
            </Text>
            <Text fw={700} size="xl">
              {
                mods.filter((id) => {
                  const meta = metadataById.get(id);
                  return meta !== undefined && !meta.name.startsWith("Mod ");
                }).length
              }
            </Text>
          </div>
          <div className={classes.statCard}>
            <Text c="dimmed" size="xs">
              Load order
            </Text>
            <Text fw={700} size="sm">
              First = loads earlier
            </Text>
          </div>
        </SimpleGrid>

        <Group align="flex-end" mb="md" wrap="wrap">
          <TextInput
            label="CurseForge Project ID"
            placeholder="928793"
            value={modDraft}
            onChange={(event) => setModDraft(event.currentTarget.value)}
            className={classes.idInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addMod();
              }
            }}
          />
          <Button
            leftSection={<Plus size={16} />}
            loading={busy}
            disabled={modDraft.trim().length === 0}
            onClick={() => void addMod()}
          >
            Add mod
          </Button>
          <TextInput
            label="Search the list"
            placeholder="Name, author, or ID"
            leftSection={<MagnifyingGlass size={14} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            className={classes.searchInput}
          />
        </Group>

        <div className={classes.table}>
          <div className={classes.tableHead}>
            <span />
            <span>#</span>
            <span>Mod</span>
            <span>ID</span>
            <span>Status</span>
            <span />
          </div>
          {filteredMods.length === 0 ? (
            <Text c="dimmed" size="sm" p="md">
              {mods.length === 0
                ? "No mods yet. Add a CurseForge Project ID (e.g. 928793)."
                : "No mods match the search."}
            </Text>
          ) : (
            filteredMods.map((modId) => {
              const index = mods.indexOf(modId);
              const meta = metadataById.get(modId);
              const name = meta?.name ?? (loadingMeta ? "Loading…" : `Mod ${modId}`);
              const authors =
                meta !== undefined && meta.authors.length > 0
                  ? meta.authors.join(", ")
                  : "—";
              return (
                <UnstyledButton
                  key={`${modId}-${index}`}
                  className={classes.tableRow}
                  data-selected={selectedId === modId || undefined}
                  onClick={() => openModDetail(modId)}
                >
                  <span className={classes.dragHint} aria-hidden>
                    <DotsSixVertical size={14} />
                  </span>
                  <Text size="sm" c="dimmed">
                    {index + 1}
                  </Text>
                  <div className={classes.modIdentity}>
                    <div className={classes.thumb} aria-hidden />
                    <div>
                      <Text fw={600} size="sm" lineClamp={1}>
                        {name}
                      </Text>
                      <Text c="dimmed" size="xs" lineClamp={1}>
                        {authors}
                      </Text>
                    </div>
                  </div>
                  <Text size="sm" ff="monospace">
                    {modId}
                  </Text>
                  <Badge color="teal" variant="light" size="sm">
                    In profile
                  </Badge>
                  <Group
                    gap={4}
                    justify="flex-end"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      disabled={index <= 0 || busy}
                      aria-label="Move up"
                      onClick={() => void moveMod(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      disabled={index >= mods.length - 1 || busy}
                      aria-label="Move down"
                      onClick={() => void moveMod(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      disabled={busy}
                      aria-label="Delete"
                      onClick={() => void removeMod(modId)}
                    >
                      <Trash size={14} />
                    </ActionIcon>
                  </Group>
                </UnstyledButton>
              );
            })
          )}
        </div>
      </div>

      <Drawer
        opened={detailOpen && selectedId !== null}
        onClose={closeDetail}
        title="Mod details"
        position="right"
        size={360}
      >
        {selectedId !== null && (
          <Stack gap="md">
            <div>
              <Title order={4}>
                {selectedMeta?.name ?? `Mod ${selectedId}`}
              </Title>
              <Text c="dimmed" size="sm" ff="monospace">
                ID {selectedId}
              </Text>
            </div>
            <Badge color="teal" variant="light" w="fit-content">
              In profile
            </Badge>
            <Text size="sm">
              {selectedMeta?.summary ?? "No description available."}
            </Text>
            <Text size="xs" c="dimmed">
              Authors:{" "}
              {selectedMeta !== null && selectedMeta.authors.length > 0
                ? selectedMeta.authors.join(", ")
                : "—"}
            </Text>
            {selectedMeta !== null && (
              <Button
                variant="light"
                leftSection={<ArrowSquareOut size={16} />}
                component="a"
                href={selectedMeta.curseforgeUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open on CurseForge
              </Button>
            )}
            <Button
              color="red"
              variant="light"
              leftSection={<Trash size={16} />}
              loading={busy}
              onClick={() => void removeMod(selectedId)}
            >
              Remove from profile
            </Button>
          </Stack>
        )}
      </Drawer>
    </div>
  );
}
