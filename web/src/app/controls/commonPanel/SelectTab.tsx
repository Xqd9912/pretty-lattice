import { Eye, EyeOff, ListChecks, Search } from "lucide-react";
import {
  memo,
  type UIEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { AtomSpec } from "../../../api/scene";
import {
  COMMON_PANEL_BODY_TEXT_CLASS,
  COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
} from "./styles";

export const SELECT_TAB_VISIBLE_ROW_COUNT = 8;
export const SELECT_TAB_ROW_HEIGHT_PX = 28;
export const SELECT_TAB_LIST_HEIGHT_PX =
  SELECT_TAB_VISIBLE_ROW_COUNT * SELECT_TAB_ROW_HEIGHT_PX;
const SELECT_TAB_OVERSCAN_ROW_COUNT = 3;

export type AtomListSortMode = "number" | "selected";

export interface SelectTabContentProps {
  canonicalAtoms: readonly AtomSpec[];
  selectedSiteIndices: ReadonlySet<number>;
  selectedOnly: boolean;
  isSiteBaseVisible: (siteIndex: number) => boolean;
  isSiteVisible: (siteIndex: number) => boolean;
  onSiteSelectionToggle: (siteIndex: number) => void;
  onSiteVisibilityToggle: (siteIndex: number) => void;
  onElementVisibilityToggle: (element: string) => void;
  onSelectedOnlyChange: (enabled: boolean) => void;
  onHideSelected: () => void;
  onShowAll: () => void;
  onInvertSelection: () => void;
  onClearSelection: () => void;
  sessionVersion: string | number;
}

interface ElementVisibilityEntry {
  element: string;
  totalCount: number;
  visibleCount: number;
  state: "full" | "mixed" | "none";
}

export const SelectTabContent = memo(function SelectTabContent({
  canonicalAtoms,
  selectedSiteIndices,
  selectedOnly,
  isSiteBaseVisible,
  isSiteVisible,
  onSiteSelectionToggle,
  onSiteVisibilityToggle,
  onElementVisibilityToggle,
  onSelectedOnlyChange,
  onHideSelected,
  onShowAll,
  onInvertSelection,
  onClearSelection,
  sessionVersion,
}: SelectTabContentProps) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<AtomListSortMode>("number");
  const [scrollTop, setScrollTop] = useState(0);
  const listViewportRef = useRef<HTMLDivElement | null>(null);

  const canonicalSiteIndices = useMemo(
    () => new Set(canonicalAtoms.map((atom) => atom.siteIndex)),
    [canonicalAtoms],
  );
  const selectedCount = useMemo(
    () =>
      Array.from(selectedSiteIndices).filter((siteIndex) => canonicalSiteIndices.has(siteIndex))
        .length,
    [canonicalSiteIndices, selectedSiteIndices],
  );
  const visibleCount = canonicalAtoms.reduce(
    (count, atom) => count + (isSiteVisible(atom.siteIndex) ? 1 : 0),
    0,
  );
  const baseVisibleCount = canonicalAtoms.reduce(
    (count, atom) => count + (isSiteBaseVisible(atom.siteIndex) ? 1 : 0),
    0,
  );
  const baseVisibilitySignature = canonicalAtoms
    .map((atom) => (isSiteBaseVisible(atom.siteIndex) ? "1" : "0"))
    .join("");
  const elementEntries = useMemo(
    () => deriveElementVisibilityEntries(canonicalAtoms, isSiteBaseVisible),
    [baseVisibilitySignature, canonicalAtoms, isSiteBaseVisible],
  );
  const matchingAtoms = useMemo(
    () => filterAndOrderAtoms(canonicalAtoms, query, selectedSiteIndices, sortMode),
    [canonicalAtoms, query, selectedSiteIndices, sortMode],
  );
  const atomWindow = virtualAtomWindow(matchingAtoms.length, scrollTop);
  const renderedAtoms = matchingAtoms.slice(atomWindow.startIndex, atomWindow.endIndex);

  useEffect(() => {
    setQuery("");
    setSortMode("number");
    resetListScroll();
  }, [sessionVersion]);

  function resetListScroll() {
    if (listViewportRef.current) {
      listViewportRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    resetListScroll();
  }

  function handleSortModeChange(nextSortMode: AtomListSortMode) {
    setSortMode(nextSortMode);
    resetListScroll();
  }

  function handleListScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
  }

  return (
    <div className="flex flex-col gap-2 pt-1.5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "text-muted-foreground")}>Selection</h2>
        <p
          aria-live="polite"
          className="text-[0.68rem] font-medium tabular-nums text-muted-foreground"
        >
          {selectedCount} selected · {visibleCount} / {canonicalAtoms.length} visible
        </p>
      </div>

      <section aria-labelledby="select-elements-label">
        <h3
          id="select-elements-label"
          className={cn(
            COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
            "px-1 leading-tight text-muted-foreground",
          )}
        >
          Elements
        </h3>
        {elementEntries.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Element visibility">
            {elementEntries.map((entry) => (
              <button
                key={entry.element}
                type="button"
                aria-label={`Toggle ${entry.element} visibility, ${entry.visibleCount} of ${entry.totalCount} visible`}
                aria-pressed={entry.state === "mixed" ? "mixed" : entry.state === "full"}
                data-visibility-state={entry.state}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  entry.state === "full"
                    ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"
                    : null,
                  entry.state === "mixed"
                    ? "border-amber-500/45 bg-amber-500/10 text-foreground hover:bg-amber-500/15"
                    : null,
                  entry.state === "none"
                    ? "border-input bg-muted/35 text-muted-foreground hover:bg-accent"
                    : null,
                )}
                onClick={() => onElementVisibilityToggle(entry.element)}
              >
                <span>{entry.element}</span>
                <span className="font-mono text-[0.65rem] font-normal tabular-nums text-muted-foreground">
                  {entry.visibleCount}/{entry.totalCount}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 px-1 text-xs text-muted-foreground">No atoms available.</p>
        )}
      </section>

      <Separator />

      <section aria-labelledby="select-atoms-label">
        <div className="flex items-center justify-between gap-2 px-1">
          <h3
            id="select-atoms-label"
            className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "text-muted-foreground")}
          >
            Atoms
          </h3>
          <span className="text-[0.65rem] tabular-nums text-muted-foreground">
            {matchingAtoms.length} match{matchingAtoms.length === 1 ? "" : "es"}
          </span>
        </div>

        <div className="relative mt-1.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search atoms"
            autoComplete="off"
            value={query}
            placeholder="Element or #N"
            className="h-8 pl-8 text-xs"
            onChange={(event) => handleQueryChange(event.target.value)}
          />
        </div>

        <div
          className="mt-1 grid h-6 grid-cols-[0.875rem_3.75rem_minmax(0,1fr)_1rem] items-center gap-x-1.5 px-1.5 text-[0.6rem] font-medium text-muted-foreground"
          aria-label="Atom list columns"
        >
          <button
            type="button"
            aria-label="Put selected atoms first"
            aria-pressed={sortMode === "selected"}
            title="Selected first"
            className={cn(
              "flex size-5 -translate-x-[3px] items-center justify-center rounded outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
              sortMode === "selected" ? "bg-accent text-foreground" : null,
            )}
            onClick={() => handleSortModeChange("selected")}
          >
            <ListChecks aria-hidden="true" className="size-3" />
          </button>
          <button
            type="button"
            aria-label="Sort atoms by number"
            aria-pressed={sortMode === "number"}
            className={cn(
              "flex h-5 min-w-0 items-center rounded px-1 font-mono tabular-nums outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
              sortMode === "number" ? "bg-accent text-foreground" : null,
            )}
            onClick={() => handleSortModeChange("number")}
          >
            Atom #
          </button>
          <span className="truncate text-right">Fractional</span>
          <Eye aria-label="Visibility" className="size-3 justify-self-center" />
        </div>

        <div
          ref={listViewportRef}
          className="overflow-x-hidden overflow-y-auto overscroll-contain rounded-md [scrollbar-gutter:stable]"
          role="list"
          aria-label="Atoms"
          style={{ height: SELECT_TAB_LIST_HEIGHT_PX }}
          onScroll={handleListScroll}
        >
          {matchingAtoms.length > 0 ? (
            <div
              className="relative"
              style={{ height: matchingAtoms.length * SELECT_TAB_ROW_HEIGHT_PX }}
            >
              {renderedAtoms.map((atom, renderedIndex) => {
                const atomNumber = atom.siteIndex + 1;
                const selected = selectedSiteIndices.has(atom.siteIndex);
                const visible = isSiteVisible(atom.siteIndex);
                const baseVisible = isSiteBaseVisible(atom.siteIndex);
                const fullPosition = formatFractionalPosition(atom.fractionalPosition);
                const absoluteIndex = atomWindow.startIndex + renderedIndex;

                return (
                  <div
                    key={atom.siteIndex}
                    role="listitem"
                    data-site-index={atom.siteIndex}
                    data-visible={visible ? "true" : "false"}
                    data-base-visible={baseVisible ? "true" : "false"}
                    className={cn(
                      "absolute inset-x-0 top-0 grid h-7 grid-cols-[0.875rem_3.75rem_minmax(0,1fr)_1rem] items-center gap-x-1.5 rounded-md px-1.5",
                      COMMON_PANEL_BODY_TEXT_CLASS,
                      selected ? "bg-primary/10" : "hover:bg-accent/60",
                      visible ? null : "text-muted-foreground",
                    )}
                    style={{ transform: `translateY(${absoluteIndex * SELECT_TAB_ROW_HEIGHT_PX}px)` }}
                  >
                    <Checkbox
                      checked={selected}
                      aria-label={`Select atom #${atomNumber} ${atom.element}`}
                      className="size-3.5 rounded-[3px]"
                      iconClassName="size-3"
                      onCheckedChange={() => onSiteSelectionToggle(atom.siteIndex)}
                    />
                    <span
                      className="truncate font-medium"
                      title={`#${atomNumber} ${atom.element}`}
                    >
                      <span className="font-mono tabular-nums">#{atomNumber}</span> {atom.element}
                    </span>
                    <span
                      aria-label={`Fractional coordinates ${fullPosition}`}
                      className="min-w-0 truncate text-right font-mono text-[0.625rem] tabular-nums text-muted-foreground"
                      title={fullPosition}
                    >
                      {formatCompactFractionalPosition(atom.fractionalPosition)}
                    </span>
                    <button
                      type="button"
                      aria-label={
                        baseVisible
                          ? `Hide atom #${atomNumber} ${atom.element}`
                          : `Show hidden atom #${atomNumber} ${atom.element}`
                      }
                      aria-pressed={baseVisible}
                      title={baseVisible ? "Visible" : "Hidden"}
                      className={cn(
                        "flex size-5 items-center justify-center justify-self-center rounded outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                        baseVisible ? "text-muted-foreground/55" : "text-muted-foreground",
                      )}
                      onClick={() => onSiteVisibilityToggle(atom.siteIndex)}
                    >
                      {baseVisible ? (
                        <Eye aria-hidden="true" className="size-3.5" />
                      ) : (
                        <EyeOff aria-hidden="true" className="size-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {canonicalAtoms.length === 0 ? "No atoms available." : "No matching atoms."}
            </div>
          )}
        </div>
      </section>

      <Separator />

      <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
        <h3
          className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "px-1 text-muted-foreground")}
        >
          View
        </h3>
        <div className="grid grid-cols-2" role="group" aria-label="View mode">
          <SelectionActionButton
            className="rounded-r-none"
            label="Normal view"
            pressed={!selectedOnly}
            disabled={canonicalAtoms.length === 0}
            onClick={() => onSelectedOnlyChange(false)}
          />
          <SelectionActionButton
            className="-ml-px rounded-l-none"
            label="Selected only"
            pressed={selectedOnly}
            disabled={canonicalAtoms.length === 0}
            onClick={() => onSelectedOnlyChange(!selectedOnly)}
          />
        </div>

        <h3
          className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "px-1 text-muted-foreground")}
        >
          Visibility
        </h3>
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="Visibility actions">
          <SelectionActionButton
            label="Hide selected"
            disabled={selectedCount === 0}
            onClick={onHideSelected}
          />
          <SelectionActionButton
            ariaLabel="Show all atoms"
            label="Show all"
            disabled={
              canonicalAtoms.length === 0 ||
              (!selectedOnly && baseVisibleCount === canonicalAtoms.length)
            }
            onClick={onShowAll}
          />
        </div>

        <h3
          className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "px-1 text-muted-foreground")}
        >
          Selection
        </h3>
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="Selection actions">
          <SelectionActionButton
            ariaLabel="Invert selection"
            label="Invert"
            disabled={canonicalAtoms.length === 0}
            onClick={onInvertSelection}
          />
          <SelectionActionButton
            ariaLabel="Clear selection"
            label="Clear"
            disabled={selectedCount === 0}
            onClick={onClearSelection}
          />
        </div>
      </div>
    </div>
  );
});

function SelectionActionButton({
  ariaLabel,
  className,
  disabled,
  label,
  onClick,
  pressed,
}: {
  ariaLabel?: string;
  className?: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={cn(
        "h-7 min-w-0 px-2 text-[0.68rem]",
        pressed ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15" : null,
        className,
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function deriveElementVisibilityEntries(
  atoms: readonly AtomSpec[],
  isSiteVisible: (siteIndex: number) => boolean,
): ElementVisibilityEntry[] {
  const entries = new Map<string, ElementVisibilityEntry>();

  for (const atom of atoms) {
    const current = entries.get(atom.element) ?? {
      element: atom.element,
      totalCount: 0,
      visibleCount: 0,
      state: "none" as const,
    };
    current.totalCount += 1;
    current.visibleCount += isSiteVisible(atom.siteIndex) ? 1 : 0;
    entries.set(atom.element, current);
  }

  return Array.from(entries.values()).map((entry) => ({
    ...entry,
    state:
      entry.visibleCount === 0
        ? "none"
        : entry.visibleCount === entry.totalCount
          ? "full"
          : "mixed",
  }));
}

export function filterAndOrderAtoms(
  atoms: readonly AtomSpec[],
  query: string,
  selectedSiteIndices: ReadonlySet<number>,
  sortMode: AtomListSortMode = "number",
): AtomSpec[] {
  const normalizedQuery = query.trim().toLowerCase();
  const numberMatch = normalizedQuery.match(/^#?(\d+)$/);
  const atomNumber = numberMatch ? Number(numberMatch[1]) : null;
  const matchingAtoms = atoms.filter((atom) => {
    if (normalizedQuery.length === 0) {
      return true;
    }
    if (atomNumber !== null) {
      return atom.siteIndex + 1 === atomNumber;
    }
    return atom.element.toLowerCase() === normalizedQuery;
  });

  return matchingAtoms.slice().sort((left, right) => {
    if (sortMode === "selected") {
      const leftSelected = selectedSiteIndices.has(left.siteIndex);
      const rightSelected = selectedSiteIndices.has(right.siteIndex);
      if (leftSelected !== rightSelected) {
        return leftSelected ? -1 : 1;
      }
    }
    return left.siteIndex - right.siteIndex;
  });
}

export function virtualAtomWindow(
  atomCount: number,
  scrollTop: number,
): { startIndex: number; endIndex: number } {
  const safeAtomCount = Math.max(0, Math.floor(atomCount));
  const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  const firstVisibleIndex = Math.floor(safeScrollTop / SELECT_TAB_ROW_HEIGHT_PX);
  const startIndex = Math.max(0, firstVisibleIndex - SELECT_TAB_OVERSCAN_ROW_COUNT);
  const endIndex = Math.min(
    safeAtomCount,
    firstVisibleIndex + SELECT_TAB_VISIBLE_ROW_COUNT + SELECT_TAB_OVERSCAN_ROW_COUNT,
  );
  return { startIndex, endIndex };
}

function formatFractionalPosition(position: readonly number[]): string {
  return `[${position.map(formatFractionalCoordinate).join(", ")}]`;
}

function formatCompactFractionalPosition(position: readonly number[]): string {
  return position.map(formatFractionalCoordinate).join(" ");
}

function formatFractionalCoordinate(value: number): string {
  return (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3);
}
