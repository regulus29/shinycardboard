import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { exportCollectionCsv, type SearchHit } from '@sc/core';
import { Badge, Button, Checkbox, Dialog, Drawer, EmptyState, Menu, PageHeader, Popover, SegmentedControl, Skeleton, Switch, cx, useToast, type MenuItem } from '../../ui';
import { readUserData, useRequiredCatalog } from '../../data';
import { DESKTOP_MIN_WIDTH_REM, SHORT_VIEWPORT_QUERY } from '../../config/constants';
import { dateStamp, downloadText } from '../../lib/download';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useSettings } from '../../settings/settingsStore';
import { SaveSearchDialog } from '../search/SaveSearchDialog';
import { SavedSearchesManager } from '../search/SavedSearchesManager';
import { BulkBar } from './BulkBar';
import type { Scope, ViewMode } from './constants';
import { activeFilterCount, AppliedFilters, FilterGroups, FilterPopover } from './FilterBar';
import { changeOwnedTotal } from './ownedActions';
import { ImportDialog } from './ImportDialog';
import { listContextSearch, readParams, writeParams, type CollectionParams } from './params';
import { toggleFieldValue } from './queryEdit';
import { ResultsList } from './ResultsList';
import type { TileMode } from './ResultTile';
import { StatsStrip } from './StatsStrip';
import { summarizeCollection } from './stats';
import { OPTIONAL_COLUMNS, loadOptionalColumns, saveOptionalColumns, type ColumnKey } from './tableColumns';
import { TagsPanel } from './TagsPanel';
import { useCollectionResults, type CollectionResults } from './useCollectionResults';
import { OrderControls, ScopeControl, orderChangeCount } from './ViewControls';
import './collection.css';

const VIEW_OPTIONS = [
  { value: 'grid' as const, label: 'Grid', icon: 'grid' as const },
  { value: 'table' as const, label: 'Table', icon: 'list' as const },
];
const SKELETON_TILES = 12;
const DECREASE_KEYS = ['-', '_'];

function ResultsSkeleton() {
  return (
    <div className="results-skeleton" role="status" aria-label="Loading cards">
      {Array.from({ length: SKELETON_TILES }, (_, index) => (
        <Skeleton key={index} className="results-skeleton__tile" />
      ))}
    </div>
  );
}

/** Collection: stats hero (one line on phones), controls, filters and the virtualized results. */
export default function CollectionPage() {
  const catalog = useRequiredCatalog();
  const toast = useToast();
  const [settings] = useSettings();
  const [search, setSearch] = useSearchParams();
  const params = readParams(search);
  const view: ViewMode = params.view ?? (settings.defaultView === 'list' ? 'table' : 'grid');
  const desktop = useMediaQuery(`(min-width: ${DESKTOP_MIN_WIDTH_REM}rem)`);
  const short = useMediaQuery(SHORT_VIEWPORT_QUERY);
  const compact = !desktop || short;
  const liveResults = useCollectionResults(params);

  const [frozen, setFrozen] = useState<CollectionResults | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selectionNote, setSelectionNote] = useState('');
  const [quickAdd, setQuickAdd] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [optionalColumns, setOptionalColumns] = useState<ColumnKey[]>(loadOptionalColumns);
  const anchor = useRef<number | null>(null);

  // While a stepper is being used in the Owned scope, keep the displayed list stable so a removed
  // card does not vanish and slide the next one under the pointer.
  const results = useMemo<CollectionResults | undefined>(
    () => (liveResults && frozen ? { ...liveResults, groups: frozen.groups, flat: frozen.flat } : liveResults),
    [liveResults, frozen],
  );
  useEffect(() => setFrozen(null), [params.query, params.scope, params.sort, params.descending, params.group]);

  const update = useCallback(
    (patch: Partial<CollectionParams>) => setSearch(writeParams(search, patch), { replace: true }),
    [search, setSearch],
  );
  const setQuery = (query: string) => update({ query });
  const contextSearch = useMemo(() => listContextSearch(search), [search]);
  const flat = results?.flat;
  const total = flat?.length ?? 0;
  const mode: TileMode = selectMode ? 'select' : quickAdd ? 'quickAdd' : 'open';
  const hasOwned = (results?.counts.size ?? 0) > 0;
  const counts = results?.counts;
  const summary = useMemo(() => (counts ? summarizeCollection(catalog, counts) : null), [catalog, counts]);

  // Selection only ever holds visible results: reconcile whenever the list changes.
  const visibleSelected = useMemo(() => {
    const visible = new Set((flat ?? []).map((hit) => hit.printing.printingKey));
    return new Set([...selected].filter((key) => visible.has(key)));
  }, [selected, flat]);
  useEffect(() => {
    if (!flat || visibleSelected.size === selected.size) return;
    const dropped = selected.size - visibleSelected.size;
    setSelected(visibleSelected);
    anchor.current = null;
    const note = `${dropped} selected ${dropped === 1 ? 'card was' : 'cards were'} deselected because they no longer match`;
    setSelectionNote(note);
    setAnnouncement(note);
  }, [flat, selected, visibleSelected]);

  const toggleRange = useCallback(
    (index: number, hit: SearchHit, shift: boolean) => {
      const list = flat ?? [];
      const from = anchor.current;
      const keys = shift && from !== null ? list.slice(Math.min(from, index), Math.max(from, index) + 1).map((h) => h.printing.printingKey) : [hit.printing.printingKey];
      setSelectionNote('');
      setSelected((current) => {
        const next = new Set(current);
        const turnOn = !current.has(hit.printing.printingKey);
        for (const key of keys) {
          if (turnOn) next.add(key);
          else next.delete(key);
        }
        return next;
      });
      anchor.current = index;
    },
    [flat],
  );

  const onActivate = useCallback(
    (index: number, hit: SearchHit, shift: boolean) => {
      if (selectMode) {
        toggleRange(index, hit, shift);
        return;
      }
      const count = results?.counts.get(hit.printing.printingKey);
      void changeOwnedTotal(hit.printing.printingKey, count, (count?.total ?? 0) + 1);
      setAnnouncement(`Added ${hit.card.name}. ${(count?.total ?? 0) + 1} owned.`);
    },
    [selectMode, toggleRange, results],
  );

  const changeSort = (sort: CollectionParams['sort']) => update(sort === params.sort ? { descending: !params.descending } : { sort, descending: false });

  const clearSelection = () => {
    setSelected(new Set());
    setSelectionNote('');
    anchor.current = null;
  };
  const toggleSelectMode = () => {
    setSelectMode((on) => !on);
    clearSelection();
    setQuickAdd(false);
  };
  const toggleQuickAdd = (on: boolean) => {
    setQuickAdd(on);
    if (on) {
      setSelectMode(false);
      clearSelection();
    }
  };
  const setColumn = (key: ColumnKey, on: boolean) => {
    const next = OPTIONAL_COLUMNS.map((column) => column.key).filter((k) => (k === key ? on : optionalColumns.includes(k)));
    setOptionalColumns(next);
    saveOptionalColumns(next);
  };

  const selectedCardKeys = () => [...new Set([...visibleSelected].map((key) => catalog.printings[key]?.cardKey).filter((key): key is string => Boolean(key)))];

  const exportCsv = async () => {
    try {
      const { owned } = await readUserData();
      downloadText(`shiny-cardboard-collection-${dateStamp()}.csv`, exportCollectionCsv(owned, catalog), 'text/csv');
      toast.show({ title: 'Collection CSV downloaded', tone: 'success' });
    } catch {
      toast.show({ title: 'CSV export failed', tone: 'danger' });
    }
  };

  const resetFilters = () => update({ query: '', scope: 'all' });
  const hasFilters = Boolean(params.query.trim()) || params.scope !== 'all';
  const warnings = results?.warnings ?? [];
  const filterCount = activeFilterCount(catalog, params.query);
  const sheetCount = filterCount + orderChangeCount(params);
  const countText = results ? `${total.toLocaleString()} ${total === 1 ? 'printing' : 'printings'}` : 'Searching';

  const menuItems: MenuItem[] = [
    { label: 'Tags', icon: 'tag', onSelect: () => setTagsOpen(true) },
    { label: 'Import', icon: 'upload', onSelect: () => setImportOpen(true) },
    { label: 'Export CSV', icon: 'download', onSelect: () => void exportCsv() },
    { label: quickAdd ? 'Turn off quick add' : 'Turn on quick add', icon: 'plus', onSelect: () => toggleQuickAdd(!quickAdd) },
    { label: selectMode ? 'Stop selecting' : 'Select cards', icon: 'check', onSelect: toggleSelectMode },
    { label: 'Save current search', icon: 'bookmark', disabled: !params.query.trim(), onSelect: () => setSaveOpen(true) },
    { label: 'Manage saved searches', icon: 'bookmark', onSelect: () => setSavedOpen(true) },
  ];

  const viewToggle = <SegmentedControl<ViewMode> label="View" size="sm" iconOnly className="collection__view" value={view} onValueChange={(next) => update({ view: next })} options={VIEW_OPTIONS} />;

  const countRow = (
    <div className="collection__count-row">
      <p className="collection__count">
        <strong>{countText.split(' ')[0]}</strong> {countText.split(' ').slice(1).join(' ')}
        {quickAdd ? <span className="collection__mode"> - tap to add</span> : null}
        {selectMode ? <span className="collection__mode"> - select</span> : null}
      </p>
      {warnings.length > 0 ? (
        <Badge tone="warning" className="collection__warning-chip">
          <span title={warnings.map((w) => w.message).join('. ')}>
            {warnings[0]?.message}
            {warnings.length > 1 ? ` (+${warnings.length - 1})` : ''}
          </span>
        </Badge>
      ) : null}
    </div>
  );

  return (
    <div className={cx('page collection', compact && 'is-compact')}>
      {compact ? (
        <h1 className="sr-only">Collection</h1>
      ) : (
        <PageHeader
          eyebrow="Library"
          title="Collection"
          subtitle={`${Object.keys(catalog.printings).length.toLocaleString()} printings across ${catalog.sets.length} sets`}
          actions={
            <div className="collection__actions">
              <Button variant="secondary" size="sm" icon="tag" onClick={() => setTagsOpen(true)}>
                Tags
              </Button>
              <Button variant="secondary" size="sm" icon="upload" onClick={() => setImportOpen(true)}>
                Import
              </Button>
              <Button variant="secondary" size="sm" icon="download" onClick={() => void exportCsv()}>
                Export CSV
              </Button>
            </div>
          }
        />
      )}

      {!summary ? (
        <Skeleton height={compact ? '1.25rem' : '5.5rem'} className="collection__stats-skeleton" />
      ) : compact ? (
        <p className="collection__oneline">
          <strong>{summary.copies.toLocaleString()}</strong> copies - <strong>{summary.uniquePrintings.toLocaleString()}</strong> of {summary.totalPrintings.toLocaleString()} printings - {summary.mainSetsComplete}/{summary.mainSets} main sets
        </p>
      ) : (
        <StatsStrip summary={summary} onImport={() => setImportOpen(true)} onQuickAdd={() => toggleQuickAdd(true)} />
      )}

      {compact ? (
        <div className="collection__bar">
          {countRow}
          <div className="collection__bar-actions">
            <Button variant={sheetCount > 0 ? 'primary' : 'secondary'} size="sm" icon="filter" onClick={() => setSheetOpen(true)}>
              Filters and sort
              {sheetCount > 0 ? <span className="collection__badge">{sheetCount}</span> : null}
            </Button>
            {viewToggle}
            <Menu
              label="More actions"
              align="end"
              items={menuItems}
              trigger={(api) => (
                <Button variant="secondary" size="sm" icon="more" aria-label="More actions" {...api.props}>
                  <span className="sr-only">More actions</span>
                </Button>
              )}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="collection__controls">
            <ScopeControl params={params} update={update} />
            <OrderControls params={params} update={update} />
            <FilterPopover catalog={catalog} query={params.query} onQueryChange={setQuery} />
            {view === 'table' ? (
              <Popover
                label="Table columns"
                trigger={(api) => (
                  <Button variant="secondary" size="sm" icon="list" {...api.props}>
                    Columns
                  </Button>
                )}
              >
                <div className="collection__columns">
                  {OPTIONAL_COLUMNS.map((column) => (
                    <Checkbox key={column.key} checked={optionalColumns.includes(column.key)} onCheckedChange={(on) => setColumn(column.key, on)} label={column.label} />
                  ))}
                </div>
              </Popover>
            ) : null}
            <div className="collection__toggles">
              <Switch checked={quickAdd} onCheckedChange={toggleQuickAdd} label="Quick add" />
              <Button variant={selectMode ? 'primary' : 'secondary'} size="sm" icon="check" aria-pressed={selectMode} onClick={toggleSelectMode}>
                Select
              </Button>
              {viewToggle}
            </div>
          </div>
          <AppliedFilters catalog={catalog} query={params.query} onQueryChange={setQuery} />
          <div className="collection__summary">
            {countRow}
            <div className="collection__summary-actions">
              {params.query.trim() ? (
                <Button variant="ghost" size="sm" icon="bookmark" onClick={() => setSaveOpen(true)}>
                  Save search
                </Button>
              ) : null}
              {hasFilters ? (
                <Button variant="ghost" size="sm" icon="close" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>
        </>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {results ? `${countText}.${warnings[0] ? ` ${warnings[0].message}.` : ''}` : ''}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {visibleSelected.size > 0 || selectMode ? (
        <BulkBar
          selectedCount={visibleSelected.size}
          resultCount={total}
          note={selectionNote}
          cardKeys={selectedCardKeys}
          onSelectAll={() => setSelected(new Set((flat ?? []).map((hit) => hit.printing.printingKey)))}
          onClear={clearSelection}
        />
      ) : null}

      {!results ? (
        <ResultsSkeleton />
      ) : total === 0 ? (
        <NoResults
          warnings={warnings.map((warning) => warning.message)}
          scope={params.scope}
          hasOwned={hasOwned}
          onReset={resetFilters}
          onBrowse={() => {
            update({ scope: 'all', query: '' });
            toggleQuickAdd(true);
          }}
          onImport={() => setImportOpen(true)}
        />
      ) : (
        <div
          className="collection__results"
          onPointerDownCapture={(event) => {
            if (params.scope === 'owned' && (event.target as HTMLElement).closest('.ui-stepper')) setFrozen((current) => current ?? liveResults ?? null);
          }}
          onKeyDownCapture={(event) => {
            if (params.scope === 'owned' && DECREASE_KEYS.includes(event.key)) setFrozen((current) => current ?? liveResults ?? null);
          }}
          onPointerLeave={() => setFrozen(null)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFrozen(null);
          }}
        >
          <ResultsList
            view={view}
            groups={results.groups}
            flat={results.flat}
            counts={results.counts}
            tagsByCard={results.tagsByCard}
            optionalColumns={optionalColumns}
            contextSearch={contextSearch}
            mode={mode}
            selected={visibleSelected}
            dimUnowned={hasOwned}
            sort={params.sort}
            descending={params.descending}
            onSort={changeSort}
            onActivate={onActivate}
            onAnnounce={setAnnouncement}
          />
        </div>
      )}

      <Drawer open={sheetOpen} onClose={() => setSheetOpen(false)} side="bottom" title="Filters and sort">
        <div className="collection__sheet">
          <ScopeControl params={params} update={update} />
          <OrderControls params={params} update={update} />
          <FilterGroups catalog={catalog} query={params.query} onQueryChange={setQuery} />
          <div className="collection__sheet-actions">
            {hasFilters ? (
              <Button variant="ghost" size="sm" icon="close" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => setSheetOpen(false)}>
              Show {total.toLocaleString()} printings
            </Button>
          </div>
        </div>
      </Drawer>
      <Dialog open={savedOpen} onClose={() => setSavedOpen(false)} title="Saved searches" size="md">
        <SavedSearchesManager
          query={params.query}
          onNavigate={() => setSavedOpen(false)}
          onSaveCurrent={() => {
            setSavedOpen(false);
            setSaveOpen(true);
          }}
        />
      </Dialog>
      <TagsPanel open={tagsOpen} onClose={() => setTagsOpen(false)} query={params.query} onToggleTag={(tag) => setQuery(toggleFieldValue(params.query, 'tag', tag))} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <SaveSearchDialog open={saveOpen} query={params.query} onClose={() => setSaveOpen(false)} />
    </div>
  );
}

interface NoResultsProps {
  warnings: string[];
  scope: Scope;
  hasOwned: boolean;
  onReset: () => void;
  onBrowse: () => void;
  onImport: () => void;
}

/** Empty states: a brand new collection gets guidance; a failed query gets fixes from the parser. */
function NoResults({ warnings, scope, hasOwned, onReset, onBrowse, onImport }: NoResultsProps) {
  if (scope === 'owned' && !hasOwned) {
    return (
      <EmptyState
        illustration="cards"
        title="You do not own any cards yet"
        description="Browse every card and tap to add copies with quick add, or import a CSV from a spreadsheet or TCGplayer."
        action={
          <div className="collection__actions">
            <Button variant="primary" icon="plus" onClick={onBrowse}>
              Browse and quick add
            </Button>
            <Button variant="secondary" icon="upload" onClick={onImport}>
              Import a file
            </Button>
          </div>
        }
      />
    );
  }
  return (
    <EmptyState
      illustration="search"
      title="No cards match"
      description={
        warnings.length > 0 ? (
          <>
            <span>Some terms were not understood:</span>
            <span className="collection__warnings">
              {warnings.map((message) => (
                <span key={message} className="collection__warning">
                  {message}
                </span>
              ))}
            </span>
          </>
        ) : (
          `Try fewer filters, a partial name, or a set and number like "unl 29". ${scope === 'missing' ? 'You may own every printing that matches.' : ''}`
        )
      }
      action={
        <Button variant="secondary" icon="close" onClick={onReset}>
          Clear search and filters
        </Button>
      }
    />
  );
}
