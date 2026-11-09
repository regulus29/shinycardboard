import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router-dom';
import type { SearchHit } from '@sc/core';
import { cx } from '../../ui';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { DESKTOP_MIN_WIDTH_REM } from '../../config/constants';
import { GRID, PAGE_JUMP_ROWS, TABLE, WIDE_MIN_WIDTH_REM, type SortKey, type ViewMode } from './constants';
import type { HitGroup, OwnedCount } from './grouping';
import { loadListState, saveListState } from './listState';
import { changeOwnedBy } from './ownedActions';
import { ResultRow } from './ResultRow';
import { ResultTile, type TileMode } from './ResultTile';
import { gridTemplate, visibleColumns, type ColumnKey, type Tier } from './tableColumns';
import { FALLBACK_WIDTH, getScroller, useElementWidth, useVirtualWindow } from './useVirtualWindow';
import { buildItems, buildOffsets, gridColumns, itemIndexForHit, tileWidth, type ListItem } from './windowing';

export interface ResultsListProps {
  view: ViewMode;
  groups: HitGroup[];
  flat: SearchHit[];
  counts: Map<string, OwnedCount>;
  tagsByCard: Record<string, string[]>;
  optionalColumns: readonly ColumnKey[];
  contextSearch: string;
  mode: TileMode;
  selected: ReadonlySet<string>;
  dimUnowned: boolean;
  sort: SortKey;
  descending: boolean;
  onSort: (sort: SortKey) => void;
  /** Called for select-mode toggles (with shift state) and quick add taps. */
  onActivate: (index: number, hit: SearchHit, shift: boolean) => void;
  /** Spoken confirmation for keyboard quantity changes. */
  onAnnounce: (message: string) => void;
}

type FocusKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End' | 'PageUp' | 'PageDown';
const FOCUS_KEYS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
const INCREASE_KEYS = ['+', '='];
const DECREASE_KEYS = ['-', '_'];
/** The one tabbable element per result: the card link or button. Steppers and checkboxes are reached by keys. */
const FOCUS_TARGET = 'a.ui-tile__main, button.ui-tile__main, .results__name';

/** Index reached from `from` by a navigation key; the grid moves by column count, the table by row. */
export function nextIndex(key: FocusKey, from: number, columns: number, total: number): number {
  const jump = columns * PAGE_JUMP_ROWS;
  const moves: Record<FocusKey, number> = {
    ArrowLeft: from - 1,
    ArrowRight: from + 1,
    ArrowUp: from - columns,
    ArrowDown: from + columns,
    Home: 0,
    End: total - 1,
    PageUp: from - jump,
    PageDown: from + jump,
  };
  return Math.min(total - 1, Math.max(0, moves[key]));
}

/** Largest natural height among rendered grid rows, so the virtual stride matches the real layout. */
function measureRows(list: HTMLElement | null): number {
  if (!list) return 0;
  let tallest = 0;
  list.querySelectorAll<HTMLElement>('.results__row-inner').forEach((row) => {
    tallest = Math.max(tallest, row.offsetHeight);
  });
  return tallest;
}

function useTier(): Tier {
  const medium = useMediaQuery(`(min-width: ${DESKTOP_MIN_WIDTH_REM}rem)`);
  const wide = useMediaQuery(`(min-width: ${WIDE_MIN_WIDTH_REM}rem)`);
  return wide ? 'wide' : medium ? 'medium' : 'phone';
}

/**
 * Virtualized grid or table of results (ARIA grid) with a roving tab stop, arrow key movement,
 * Enter to open, +/- to change the owned quantity, and scroll restoration.
 */
export function ResultsList(props: ResultsListProps) {
  const { view, groups, flat, counts, tagsByCard, optionalColumns, contextSearch, mode, selected, dimUnowned, sort, descending, onSort, onActivate, onAnnounce } = props;
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [, bump] = useReducer((tick: number) => tick + 1, 0);
  const [activeIndex, setActiveIndex] = useState(0);
  const shiftRef = useRef(false);
  const pendingFocus = useRef<number | null>(null);
  const saved = useMemo(() => loadListState(location.key), [location.key]);
  const measuredWidth = useElementWidth(listRef);
  const width = measuredWidth || FALLBACK_WIDTH;
  const isGrid = view === 'grid';
  const tier = useTier();
  const columnDefs = useMemo(() => visibleColumns(tier, optionalColumns), [tier, optionalColumns]);

  const columns = isGrid ? gridColumns(width, GRID.minTilePx, GRID.gapPx) : 1;
  const estimatedRow = tileWidth(width, columns, GRID.gapPx) * GRID.aspect + GRID.chromePx;
  const [measuredRow, setMeasuredRow] = useState<number>(saved ? saved.rowStride - GRID.gapPx : 0);
  const rowHeight = isGrid ? measuredRow || estimatedRow : TABLE.rowPx;
  const rowStride = isGrid ? rowHeight + GRID.gapPx : TABLE.rowPx;
  const headerHeight = isGrid ? GRID.groupHeaderPx : TABLE.groupHeaderPx;

  const items = useMemo(() => buildItems(groups, { columns, rowStride, headerHeight }), [groups, columns, rowStride, headerHeight]);
  const offsets = useMemo(() => buildOffsets(items.map((item) => item.height)), [items]);
  const strideRef = useRef(rowStride);
  strideRef.current = rowStride;
  const onScroll = useCallback((scrollTop: number) => saveListState(location.key, { scrollTop, rowStride: strideRef.current }), [location.key]);
  const { range, revealOffset } = useVirtualWindow(bodyRef, offsets, isGrid ? GRID.overscanPx : TABLE.overscanPx, onScroll);

  // Keep the active index inside the list when results shrink.
  const active = Math.min(activeIndex, Math.max(0, flat.length - 1));

  // Re-measure real row height whenever the rendered rows or width change (grid only).
  useLayoutEffect(() => {
    if (!isGrid) return;
    const tallest = measureRows(bodyRef.current);
    if (tallest > 0 && Math.abs(tallest - measuredRow) >= 1) setMeasuredRow(tallest);
  }, [isGrid, range, columns, width, measuredRow, groups]);

  // Restore the scroll position once the list has a real width, before the first paint.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !measuredWidth) return;
    restored.current = true;
    const scroller = getScroller();
    if (saved && scroller) scroller.scrollTop = saved.scrollTop;
  }, [measuredWidth, saved]);

  // Roving tab stop: exactly one focus target is tabbable (the active one, or the first rendered).
  useLayoutEffect(() => {
    const cells = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('[data-result-index]') ?? []);
    const stop = cells.some((cell) => Number(cell.dataset.resultIndex) === active) ? active : Number(cells[0]?.dataset.resultIndex ?? -1);
    for (const cell of cells) {
      const isStop = Number(cell.dataset.resultIndex) === stop;
      cell.querySelectorAll<HTMLElement>('a, button, input').forEach((el) => {
        el.tabIndex = isStop && el.matches(FOCUS_TARGET) ? 0 : -1;
      });
    }
  });

  // Move DOM focus to the pending target as soon as its row is rendered.
  const focusPending = () => {
    const target = pendingFocus.current;
    if (target === null) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-result-index="${target}"]`)?.querySelector<HTMLElement>(FOCUS_TARGET);
    if (!el) return;
    pendingFocus.current = null;
    el.tabIndex = 0;
    el.focus({ preventScroll: true });
  };
  useEffect(focusPending);

  const moveFocus = (target: number) => {
    const itemIndex = itemIndexForHit(items, target);
    if (itemIndex < 0) return;
    pendingFocus.current = target;
    setActiveIndex(target);
    revealOffset(offsets[itemIndex] ?? 0, items[itemIndex]?.height ?? rowStride);
    focusPending();
    if (pendingFocus.current !== null) bump();
  };

  const adjustFocused = (index: number, delta: number) => {
    const hit = flat[index];
    if (!hit) return;
    const count = counts.get(hit.printing.printingKey);
    const next = Math.max(0, (count?.total ?? 0) + delta);
    void changeOwnedBy(hit.printing.printingKey, count, delta);
    onAnnounce(`${hit.card.name}: ${next} owned`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const origin = target.closest<HTMLElement>('[data-result-index]');
    if (!origin || target.closest('input')) return;
    const from = Number(origin.dataset.resultIndex);
    if (INCREASE_KEYS.includes(event.key) || DECREASE_KEYS.includes(event.key)) {
      event.preventDefault();
      adjustFocused(from, INCREASE_KEYS.includes(event.key) ? 1 : -1);
      return;
    }
    if (!FOCUS_KEYS.includes(event.key) || target.closest('.ui-stepper')) return;
    event.preventDefault();
    moveFocus(nextIndex(event.key as FocusKey, from, columns, flat.length));
  };

  const activate = useCallback((index: number, hit: SearchHit) => onActivate(index, hit, shiftRef.current), [onActivate]);

  const renderRowItem = (item: Extract<ListItem, { kind: 'row' }>) =>
    isGrid ? (
      <div key={item.key} className="results__row" style={{ height: item.height }}>
        <div role="row" className="results__row-inner" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: GRID.gapPx }}>
          {item.hits.map((hit, offset) => (
            <ResultTile
              key={hit.printing.printingKey}
              hit={hit}
              index={item.start + offset}
              count={counts.get(hit.printing.printingKey)}
              mode={mode}
              selected={selected.has(hit.printing.printingKey)}
              dimUnowned={dimUnowned}
              contextSearch={contextSearch}
              onActivate={activate}
            />
          ))}
        </div>
      </div>
    ) : (
      <ResultRow
        key={item.key}
        hit={item.hits[0] as SearchHit}
        index={item.start}
        count={counts.get((item.hits[0] as SearchHit).printing.printingKey)}
        tags={tagsByCard[(item.hits[0] as SearchHit).card.cardKey] ?? []}
        mode={mode}
        selected={selected.has((item.hits[0] as SearchHit).printing.printingKey)}
        contextSearch={contextSearch}
        columns={columnDefs}
        onActivate={activate}
      />
    );

  const rendered = items.slice(range.start, range.end).map((item) =>
    item.kind === 'header' ? (
      <div key={item.key} role="row" className="results__group" style={{ height: item.height }}>
        <div role="gridcell" className="results__group-cell">
          <h3 className="results__group-title">
            {item.label}
            <span className="results__group-count">{item.count.toLocaleString()}</span>
          </h3>
        </div>
      </div>
    ) : (
      renderRowItem(item)
    ),
  );

  const total = offsets[offsets.length - 1] ?? 0;
  const top = offsets[range.start] ?? 0;
  return (
    <div
      ref={listRef}
      className={cx('results', isGrid ? 'results--grid' : 'results--table')}
      role="grid"
      aria-label="Cards"
      aria-rowcount={isGrid ? undefined : flat.length + 1}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const index = (event.target as HTMLElement).closest<HTMLElement>('[data-result-index]')?.dataset.resultIndex;
        if (index !== undefined) setActiveIndex(Number(index));
      }}
      onClickCapture={(event) => {
        shiftRef.current = event.shiftKey;
      }}
    >
      {isGrid ? null : (
        <div role="row" aria-rowindex={1} className="results__thead" style={{ gridTemplateColumns: gridTemplate(columnDefs) }}>
          {columnDefs.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className={column.numeric ? 'results__num' : undefined}
              aria-sort={column.sort === sort && sort !== 'relevance' ? (descending ? 'descending' : 'ascending') : undefined}
            >
              {column.sort ? (
                <button type="button" className="results__sort" onClick={() => onSort(column.sort as SortKey)}>
                  {column.label}
                  {column.sort === sort ? <span aria-hidden="true" className={cx('results__sort-icon', descending && 'is-desc')} /> : null}
                </button>
              ) : (
                column.label
              )}
            </div>
          ))}
        </div>
      )}
      <div ref={bodyRef} className="results__body" style={{ height: total, paddingTop: top }}>
        {rendered}
      </div>
    </div>
  );
}
