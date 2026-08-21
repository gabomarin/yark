import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { Loader, Pagination, Text } from "@mantine/core";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type {
  ModCategory,
  ModSearchOptions,
  ModSearchPage,
  ModsSearchSortField,
  ModsSearchSortOrder,
} from "@shared/types";
import type { DataTableSortStatus } from "mantine-datatable";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { ServerModsDiscoverToolbar } from "./ServerModsDiscoverToolbar";
import {
  LOAD_ORDER_SORT,
  ServerModsTable,
} from "./ServerModsTable";
import {
  DISCOVER_DEFAULT_SORT_FIELD,
  DISCOVER_DEFAULT_SORT_ORDER,
  DISCOVER_PAGE_SIZE,
  discoverColumnSort,
  discoverSortFromColumn,
} from "./modsDiscoverConstants";
import {
  buildDiscoveryRows,
  type ModRow,
} from "./serverModsModel";
import classes from "./ServerModsPanel.module.css";

interface Props {
  configuredIds: string[];
  disabledIds: string[];
  metadata: Map<string, import("@shared/types").ModMetadata>;
  busyKey: string | null;
  onError: (message: string | null) => void;
  onInspect: (row: ModRow) => void;
  onAdd: (row: ModRow) => void;
  onOpenExternal: (url: string) => void;
  /** Called with the latest catalog page so the parent can resolve add-by-slug. */
  onCatalogChange: (catalog: ModSearchPage | null) => void;
}

export function ServerModsDiscoverSection(props: Props): ReactElement {
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [catalog, setCatalog] = useState<ModSearchPage | null>(null);
  const [categories, setCategories] = useState<ModCategory[]>([]);
  const [categoryValue, setCategoryValue] = useState("all");
  const [sortField, setSortField] = useState<ModsSearchSortField>(
    DISCOVER_DEFAULT_SORT_FIELD,
  );
  const [sortOrder, setSortOrder] = useState<ModsSearchSortOrder>(
    DISCOVER_DEFAULT_SORT_ORDER,
  );
  const [page, setPage] = useState(1);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const tableSortStatus = useMemo((): DataTableSortStatus<ModRow> => {
    const mapped = discoverColumnSort(sortField, sortOrder);
    if (mapped === null) return LOAD_ORDER_SORT;
    return {
      columnAccessor: mapped.columnAccessor,
      direction: mapped.direction,
    };
  }, [sortField, sortOrder]);

  const disabledSet = useMemo(
    () => new Set(props.disabledIds),
    [props.disabledIds],
  );
  const rows = useMemo(
    () =>
      buildDiscoveryRows(
        props.configuredIds,
        disabledSet,
        props.metadata,
        catalog,
      ),
    [catalog, props.configuredIds, disabledSet, props.metadata],
  );

  const categoryOptions = useMemo(() => {
    const classEntries = categories
      .filter((entry) => entry.isClass)
      .sort(byDisplayIndex);
    const leaves = categories
      .filter((entry) => !entry.isClass)
      .sort(byDisplayIndex);
    return [
      { value: "all", label: "All categories" },
      ...classEntries.map((entry) => ({
        value: `class:${entry.id}`,
        label: entry.name,
      })),
      ...leaves.map((entry) => ({
        value: `category:${entry.id}`,
        label: entry.name,
      })),
    ];
  }, [categories]);

  useEffect(() => {
    let alive = true;
    void window.api.listModCategories().then((result) => {
      if (!alive) return;
      // Categories are optional chrome: an older Worker without GET /v1/categories
      // must not paint "Unknown route" over a successful browse (#297).
      if (!result.ok) {
        setCategories([]);
        return;
      }
      setCategories(result.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setSearching(true);
      props.onError(null);
      try {
        const options = buildSearchOptions(
          categoryValue,
          sortField,
          sortOrder,
          page,
        );
        const result = await window.api.searchMods(committedQuery, options);
        if (!alive) return;
        if (!result.ok) {
          props.onError(result.error);
          setCatalog(null);
          props.onCatalogChange(null);
          return;
        }
        setCatalog(result.data);
        props.onCatalogChange(result.data);
        setHasLoadedOnce(true);
      } finally {
        if (alive) setSearching(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional search triggers
  }, [committedQuery, categoryValue, sortField, sortOrder, page]);

  const totalCount = catalog?.pagination.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / DISCOVER_PAGE_SIZE));
  const showPagination = hasLoadedOnce && totalCount > DISCOVER_PAGE_SIZE;

  return (
    <div className={classes.sectionLayout}>
      <div className={classes.sectionTop}>
        <ServerModsDiscoverToolbar
          query={query}
          searching={searching}
          categoryValue={categoryValue}
          categoryOptions={categoryOptions}
          onQueryChange={setQuery}
          onSearch={() => {
            setPage(1);
            setCommittedQuery(query.trim());
          }}
          onCategoryChange={(value) => {
            setCategoryValue(value);
            setPage(1);
          }}
        />
        {hasLoadedOnce && totalCount > 0 ? (
          <Text size="sm" c="dimmed">
            {totalCount.toLocaleString()} mods
            {committedQuery.length > 0 ? ` matching “${committedQuery}”` : ""}
          </Text>
        ) : null}
      </div>
      <div className={classes.sectionMain}>
        {searching && rows.length === 0 ? (
          <Loader size="sm" />
        ) : rows.length === 0 ? (
          <EmptyState
            layout="stacked"
            icon={<MagnifyingGlass size={24} />}
            title={
              hasLoadedOnce
                ? "No mods match these filters"
                : "Browse the CurseForge catalog"
            }
            description={
              hasLoadedOnce
                ? "Try another search or category."
                : "Popular ASA mods load here. Use the search icon or Enter for a text query."
            }
          />
        ) : (
          <ServerModsTable
            rows={rows}
            mode="discover"
            busyKey={props.busyKey}
            sortStatus={tableSortStatus}
            onSortStatusChange={(status) => {
              const accessor = String(status.columnAccessor);
              if (accessor === "loadIndex") {
                setSortField(DISCOVER_DEFAULT_SORT_FIELD);
                setSortOrder(DISCOVER_DEFAULT_SORT_ORDER);
                setPage(1);
                return;
              }
              const mapped = discoverSortFromColumn(accessor, status.direction);
              if (mapped === null) return;
              setSortField(mapped.sortField);
              setSortOrder(mapped.sortOrder);
              setPage(1);
            }}
            remoteSorted
            onInspect={props.onInspect}
            onAdd={props.onAdd}
            onToggle={() => undefined}
            onRemove={() => undefined}
            onOpenExternal={props.onOpenExternal}
          />
        )}
      </div>
      {showPagination ? (
        <div className={classes.paginationFooter}>
          <Pagination
            value={page}
            total={pageCount}
            onChange={setPage}
            size="sm"
          />
        </div>
      ) : null}
    </div>
  );
}

function byDisplayIndex(left: ModCategory, right: ModCategory): number {
  const leftIndex = left.displayIndex ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = right.displayIndex ?? Number.MAX_SAFE_INTEGER;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.name.localeCompare(right.name);
}

function buildSearchOptions(
  categoryValue: string,
  sortField: ModsSearchSortField,
  sortOrder: ModsSearchSortOrder,
  page: number,
): ModSearchOptions {
  const options: ModSearchOptions = {
    index: (page - 1) * DISCOVER_PAGE_SIZE,
    pageSize: DISCOVER_PAGE_SIZE,
    sortField,
    sortOrder,
  };
  if (categoryValue.startsWith("class:")) {
    const id = Number(categoryValue.slice("class:".length));
    if (Number.isInteger(id) && id > 0) options.classId = id;
  } else if (categoryValue.startsWith("category:")) {
    const id = Number(categoryValue.slice("category:".length));
    if (Number.isInteger(id) && id > 0) options.categoryId = id;
  }
  return options;
}
