import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Pagination,
  Stack,
  Text,
} from "@mantine/core";
import { ArrowLeft } from "@phosphor-icons/react";
import type { ModCategory, ModMetadata, ModSearchPage } from "@shared/types";
import { SearchField } from "@ui/SearchField/SearchField";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import {
  MAPS_CATEGORY_UNAVAILABLE_COPY,
  MAPS_SEARCH_PAGE_SIZE,
  buildMapsSearchOptions,
  buildMapsSearchRows,
  enrichMapsSearchPage,
  hasMapsCategoryFilter,
  isValidMapLaunchToken,
  resolveMapsCategoryFilter,
  type MapsSearchApplyPayload,
  type MapsSearchRow,
} from "./mapsSearchModel";
import { fetchMapsSearchDetail } from "./mapsSearchInspect";
import { ServerFormMapsSearchDetailStep } from "./ServerFormMapsSearchDetailStep";
import { ServerFormMapsSearchConfirmStep } from "./ServerFormMapsSearchConfirmStep";
import { ServerFormMapsSearchCard } from "./ServerFormMapsSearchCard";
import { useMapsSearchModalEscape } from "./useMapsSearchModalEscape";
import classes from "./ServerFormMapsSearchModal.module.css";

interface Props {
  opened: boolean;
  onClose: () => void;
  onApply: (payload: MapsSearchApplyPayload) => void;
}

type Step = "search" | "detail" | "confirm";

function modalTitle(step: Step, detail: ModMetadata | null, picked: MapsSearchRow | null): string {
  if (step === "search") return "Search CurseForge Maps";
  if (step === "detail") return detail?.name ?? "Map mod details";
  return `Use ${picked?.mod.name ?? "map"}`;
}

export function ServerFormMapsSearchModal(props: Props): ReactElement {
  const [categories, setCategories] = useState<ModCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  /** False until the first categories fetch for this open completes (avoids transient unavailable error). */
  const [categoriesResolved, setCategoriesResolved] = useState(false);
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [catalog, setCatalog] = useState<ModSearchPage | null>(null);
  const [rows, setRows] = useState<MapsSearchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<MapsSearchRow | null>(null);
  const [confirmToken, setConfirmToken] = useState("");
  const [saveFolder, setSaveFolder] = useState("");
  const [detail, setDetail] = useState<ModMetadata | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<MapsSearchRow | null>(null);
  const [confirmOrigin, setConfirmOrigin] = useState<"search" | "detail">("search");
  const inspectTargetRef = useRef<string | null>(null);

  const categoryFilter = useMemo(
    () => resolveMapsCategoryFilter(categories),
    [categories],
  );
  const mapsCategoryReady = hasMapsCategoryFilter(categoryFilter);

  useEffect(() => {
    if (!props.opened) return;
    let alive = true;
    setCategoriesResolved(false);
    setCategoriesLoading(true);
    void window.api.listModCategories().then((result) => {
      if (!alive) return;
      setCategories(result.ok ? result.data : []);
      setCategoriesLoading(false);
      setCategoriesResolved(true);
    });
    return () => {
      alive = false;
    };
  }, [props.opened]);

  useEffect(() => {
    if (!props.opened) {
      setStep("search");
      setQuery("");
      setCommittedQuery("");
      setPage(1);
      setCatalog(null);
      setRows([]);
      setError(null);
      setPicked(null);
      setConfirmToken("");
      setSaveFolder("");
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      setDetailRow(null);
      setConfirmOrigin("search");
      inspectTargetRef.current = null;
      setCategoriesResolved(false);
      setCategoriesLoading(false);
      return;
    }
    setCommittedQuery("");
    setPage(1);
  }, [props.opened]);

  useEffect(() => {
    if (!props.opened) return;
    if (categoriesLoading || !categoriesResolved) return;

    if (!mapsCategoryReady) {
      setSearching(false);
      setError(MAPS_CATEGORY_UNAVAILABLE_COPY);
      setCatalog(null);
      setRows([]);
      return;
    }

    let alive = true;
    const run = async () => {
      setSearching(true);
      setError(null);
      await runWithFinally(
        async () => {
          const result = await window.api.searchMods(
            committedQuery,
            buildMapsSearchOptions(categoryFilter, page),
          );
          if (!alive) return;
          if (!result.ok) {
            setError(result.error);
            setCatalog(null);
            setRows([]);
            return;
          }
          setCatalog(result.data);
          const enriched = await enrichMapsSearchPage(result.data);
          if (!alive) return;
          setRows(buildMapsSearchRows(enriched));
        },
        () => {
          if (alive) setSearching(false);
        },
      );
    };
    void run();
    return () => {
      alive = false;
    };
  }, [
    props.opened,
    categoriesLoading,
    categoriesResolved,
    mapsCategoryReady,
    committedQuery,
    categoryFilter,
    page,
  ]);

  const totalCount = catalog?.pagination.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / MAPS_SEARCH_PAGE_SIZE));
  const ready = isValidMapLaunchToken(confirmToken);
  const startConfirm = (row: MapsSearchRow) => {
    setConfirmOrigin(step === "detail" ? "detail" : "search");
    setPicked(row);
    setConfirmToken(row.token?.token ?? "");
    setSaveFolder("");
    setStep("confirm");
    inspectTargetRef.current = null;
  };

  const openDetail = (row: MapsSearchRow) => {
    setDetailRow(row);
    setDetail(row.mod);
    setDetailError(null);
    setDetailLoading(true);
    setStep("detail");
    void fetchMapsSearchDetail({
      mod: row.mod,
      inspectTargetRef,
      onDetail: setDetail,
      onLoading: setDetailLoading,
      onError: setDetailError,
    });
  };

  const backToSearch = useCallback(() => {
    inspectTargetRef.current = null;
    setStep("search");
    setDetailRow(null);
    setDetailError(null);
  }, []);

  const backFromNestedStep = useCallback(() => {
    if (step === "detail") {
      backToSearch();
      return;
    }
    if (step === "confirm") {
      setStep(confirmOrigin === "detail" && detail !== null ? "detail" : "search");
    }
  }, [step, confirmOrigin, detail, backToSearch]);

  useMapsSearchModalEscape({
    opened: props.opened,
    step,
    onClose: props.onClose,
    onBack: backFromNestedStep,
  });

  const apply = () => {
    if (picked === null || !ready) return;
    props.onApply({
      map: confirmToken.trim(),
      mapModId: picked.mod.id,
      mapSaveFolder: saveFolder.trim().length > 0 ? saveFolder.trim() : null,
      mod: picked.mod,
    });
    props.onClose();
  };

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      closeOnEscape={false}
      title={
        <Group gap="xs" wrap="nowrap" className={classes.modalTitleRow}>
          {step !== "search" ? (
            <ActionIcon
              variant="subtle"
              size="lg"
              radius="md"
              aria-label="Back"
              onClick={backFromNestedStep}
            >
              <ArrowLeft size={18} weight="bold" />
            </ActionIcon>
          ) : null}
          <Text component="h2" className={classes.modalTitle} lineClamp={1}>
            {modalTitle(step, detail, picked)}
          </Text>
        </Group>
      }
      size={step === "confirm" ? 560 : 960}
      centered
      classNames={{
        content:
          step === "confirm"
            ? `${classes.modalContent} ${classes.modalContentConfirm}`
            : classes.modalContent,
        header: classes.modalHeader,
        body: step === "confirm" ? `${classes.modalBody} ${classes.modalBodyConfirm}` : classes.modalBody,
      }}
    >
      {step === "search" ? (
        <div className={classes.modalStep}>
          <Stack gap="md">
            <SearchField
              label="Search Maps"
              value={query}
              onChange={setQuery}
              placeholder="Filter by map name or author…"
              onSubmit={() => {
                setPage(1);
                setCommittedQuery(query.trim());
              }}
              submitting={searching}
            />
            {error !== null && categoriesResolved && !categoriesLoading ? (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            ) : null}
          </Stack>
          <div className={classes.modalStepScroll}>
            {categoriesLoading
            || !categoriesResolved
            || (searching && rows.length === 0 && mapsCategoryReady) ? (
              <Group justify="center" py="lg">
                <Loader size="sm" />
              </Group>
            ) : !mapsCategoryReady ? (
              <div className={classes.emptySearch}>{MAPS_CATEGORY_UNAVAILABLE_COPY}</div>
            ) : rows.length === 0 ? (
              <div className={classes.emptySearch}>No map mods match that query.</div>
            ) : (
              <div className={classes.grid}>
                {rows.map((row) => (
                  <ServerFormMapsSearchCard
                    key={row.mod.id}
                    row={row}
                    onUse={() => startConfirm(row)}
                    onInspect={() => openDetail(row)}
                  />
                ))}
              </div>
            )}
          </div>
          {pageCount > 1 && mapsCategoryReady ? (
            <Group justify="center">
              <Pagination value={page} total={pageCount} onChange={setPage} size="sm" />
            </Group>
          ) : null}
          <div className={classes.footer}>
            <Button variant="default" onClick={props.onClose}>
              Cancel
            </Button>
          </div>
        </div>
      ) : step === "detail" && detail !== null ? (
          <ServerFormMapsSearchDetailStep
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onUseMap={() => {
              if (detailRow === null) return;
              startConfirm(detailRow);
            }}
          />
        ) : picked !== null ? (
          <ServerFormMapsSearchConfirmStep
            picked={picked}
            confirmToken={confirmToken}
            saveFolder={saveFolder}
            ready={ready}
            onConfirmTokenChange={setConfirmToken}
            onSaveFolderChange={setSaveFolder}
            onApply={apply}
          />
        ) : null}
    </Modal>
  );
}
