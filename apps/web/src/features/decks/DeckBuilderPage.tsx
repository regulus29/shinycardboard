import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  allocationConflicts,
  deckCompletion,
  deckStats,
  defaultRules,
  legalCards,
  missingCards,
  ownedByCard,
  suggestFill,
  suggestMissing,
  validateDeck,
  type Deck,
  type DeckSection,
} from '@sc/core';
import { paths } from '../../app/paths';
import { deleteDeck, duplicateDeck, saveDeck, useDecks, useOwned, useRequiredCatalog, useSearchContext } from '../../data';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useSettings } from '../../settings/settingsStore';
import { Badge, Button, Drawer, EmptyState, Skeleton, Tabs, useToast } from '../../ui';
import { applySuggestions, missingChampionMarker, realSuggestions } from './assistModel';
import { BuilderHeader, countsText } from './BuilderHeader';
import { BuilderProvider, useBuilder, type BuilderApi, type PoolControls } from './builderContext';
import { CardPool } from './CardPool';
import { BUILDER_PANES_MIN_REM, BUILDER_TWO_PANE_MIN_REM, PANE_LABELS, PHONE_QUERY, type PaneId } from './constants';
import { DeckPane } from './DeckPane';
import { totalCount, withValidChampion } from './deckModel';
import { ExportDialog } from './ExportDialog';
import { InsightsPane } from './InsightsPane';
import { buyableMissing, fillTotal, retiredKeys, validity } from './insightsModel';
import { LegendChangeDialog } from './LegendChangeDialog';
import { NO_FILTERS } from './poolModel';
import { SectionSwitch } from './SectionSwitch';
import { useDeckDraft } from './useDeckDraft';
import './decks.css';

const WIDE_QUERY = `(min-width: ${BUILDER_PANES_MIN_REM}rem)`;
const TWO_PANE_QUERY = `(min-width: ${BUILDER_TWO_PANE_MIN_REM}rem)`;
const TAB_PANES: PaneId[] = ['pool', 'deck', 'insights'];
type Mode = 'wide' | 'two' | 'tabs';

/** Collapse the app sidebar to its rail while building, then restore the user's choice. Never left persisted. */
function useBuilderRail(active: boolean): void {
  const [settings, update] = useSettings();
  const wasCollapsed = settings.sidebarCollapsed;
  useEffect(() => {
    if (!active || wasCollapsed) return;
    update({ sidebarCollapsed: true });
    const restore = () => update({ sidebarCollapsed: false });
    window.addEventListener('pagehide', restore);
    return () => {
      window.removeEventListener('pagehide', restore);
      restore();
    };
    // Only the state on entry matters; later toggles by the user are left alone.
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Pinned bottom bar for the tabbed layouts: counts, status (opens Insights) and one tap fill. */
function ActionBar({ onInsights }: { onInsights: () => void }) {
  const { completion, issues, assist, edit, catalog, rules } = useBuilder();
  const state = validity(issues);
  return (
    <div className="dk-bar" role="region" aria-label="Deck summary">
      <span className="dk-bar__counts">{countsText(completion, false)}</span>
      <Button variant="ghost" size="sm" onClick={onInsights} aria-label={`Deck status: ${state.label}. Open insights`}>
        <Badge tone={state.tone}>{state.label}</Badge>
      </Button>
      {assist.picks.length > 0 ? (
        <Button size="sm" icon="sparkles" onClick={() => edit((d) => applySuggestions(d, catalog, assist.picks, rules))}>
          Fill ({fillTotal(assist.picks)})
        </Button>
      ) : null}
    </div>
  );
}

function NotFound() {
  return (
    <div className="page dk-page">
      <EmptyState
        illustration="deck"
        title="Deck not found"
        description="It may have been deleted on another device, or the link is out of date."
        action={
          <Link to={paths.decks()}>
            <Button>Back to decks</Button>
          </Link>
        }
      />
    </div>
  );
}

function Loading() {
  return (
    <div className="page dk-page" aria-busy="true">
      <Skeleton height="4rem" />
      <Skeleton height="24rem" />
    </div>
  );
}

interface BuilderProps {
  deck: Deck;
  draft: ReturnType<typeof useDeckDraft>;
  owned: NonNullable<ReturnType<typeof useOwned>>;
  allDecks: Deck[];
}

function Builder({ deck, draft, owned, allDecks }: BuilderProps) {
  const catalog = useRequiredCatalog();
  const rules = defaultRules;
  const navigate = useNavigate();
  const toast = useToast();
  const searchContext = useSearchContext();
  const phone = useMediaQuery(PHONE_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  const twoPane = useMediaQuery(TWO_PANE_QUERY) && !wide;
  const mode: Mode = wide ? 'wide' : twoPane ? 'two' : 'tabs';
  useBuilderRail(!phone);

  const [pane, setPane] = useState<PaneId>('deck');
  const [section, setSection] = useState<DeckSection>('main');
  const [pool, setPoolState] = useState<PoolControls>(() => ({ query: '', scope: owned.length > 0 ? 'owned' : 'all', filters: NO_FILTERS }));
  const [legendOpen, setLegendOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [showBuy, setShowBuy] = useState(false);

  const legend = deck.legendKey ? catalog.cards[deck.legendKey] : undefined;
  const chosenChampion = deck.chosenChampionKey ? catalog.cards[deck.chosenChampionKey] : undefined;
  const legal = useMemo(() => legalCards(legend, catalog, rules, chosenChampion), [legend, catalog, rules, chosenChampion]);
  const ownedCounts = useMemo(() => ownedByCard(owned, catalog), [owned, catalog]);
  const issues = useMemo(() => validateDeck(deck, catalog, rules), [deck, catalog, rules]);
  const stats = useMemo(() => deckStats(deck, catalog), [deck, catalog]);
  const completion = useMemo(() => deckCompletion(deck, catalog, rules), [deck, catalog, rules]);
  const missing = useMemo(() => buyableMissing(missingCards(deck, owned, catalog), catalog), [deck, owned, catalog]);
  const retired = useMemo(() => retiredKeys(deck, catalog), [deck, catalog]);
  const merged = useMemo(() => (allDecks.some((d) => d.id === deck.id) ? allDecks.map((d) => (d.id === deck.id ? deck : d)) : [...allDecks, deck]), [allDecks, deck]);
  const conflicts = useMemo(() => allocationConflicts(merged, owned, catalog).filter((c) => c.decks.includes(deck.id)), [merged, owned, catalog, deck.id]);

  // Assistants see the deck with an invalid chosen champion treated as unset.
  const stable = useDeferredValue(deck);
  const sane = useMemo(() => withValidChampion(stable, catalog, rules), [stable, catalog, rules]);
  const fill = useMemo(() => (legend ? suggestFill(sane, owned, catalog, rules) : []), [sane, owned, catalog, rules, legend]);
  const buy = useMemo(() => (showBuy && legend ? suggestMissing(sane, owned, catalog, rules).filter((s) => s.count > 0) : []), [showBuy, sane, owned, catalog, rules, legend]);

  const setPool = useCallback((change: Partial<PoolControls>) => setPoolState((current) => ({ ...current, ...change })), []);
  const openLegendPicker = useCallback(() => setLegendOpen(true), []);
  const browseChampions = useCallback(() => {
    setSection('main');
    setPoolState((current) => ({ ...current, scope: 'all', filters: { ...current.filters, championsOnly: true } }));
    setPane('pool');
  }, []);

  const api: BuilderApi = {
    assist: { picks: realSuggestions(fill), marker: missingChampionMarker(fill), buy, showBuy, setShowBuy, browseChampions },
    catalog,
    rules,
    deck,
    edit: draft.edit,
    legend,
    chosenChampion,
    legal,
    owned,
    ownedCounts,
    searchContext,
    allDecks: merged,
    section,
    setSection,
    pool,
    setPool,
    issues,
    stats,
    completion,
    missing,
    conflicts,
    retired,
    openLegendPicker,
  };

  const duplicate = async () => {
    await draft.flush();
    const copy = await duplicateDeck(deck.id);
    if (copy) toast.show({ title: 'Duplicated', description: copy.name, tone: 'success', action: { label: 'Open copy', onClick: () => navigate(paths.deck(copy.id)) } });
  };

  const remove = async () => {
    await draft.flush();
    await deleteDeck(deck.id);
    navigate(paths.decks());
    toast.show({
      title: 'Deck deleted',
      description: deck.name,
      tone: 'info',
      action: { label: 'Undo', onClick: () => void saveDeck({ id: deck.id }, { revive: true }).then(() => navigate(paths.deck(deck.id))) },
    });
  };

  const tabbed = mode === 'tabs';
  const panes: Record<PaneId, ReactElement> = { pool: <CardPool withSections={tabbed} />, deck: <DeckPane withSections={tabbed} />, insights: <InsightsPane /> };
  const paneIds: PaneId[] = mode === 'wide' ? TAB_PANES : ['pool', 'deck'];
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  return (
    <BuilderProvider value={api}>
      <div className={`page dk-builder dk-builder--${mode}`}>
        <BuilderHeader
          status={draft.status}
          phone={phone}
          onRetry={() => void draft.flush()}
          onDuplicate={() => void duplicate()}
          onExport={() => setExportOpen(true)}
          onDelete={() => void remove()}
          onOpenInsights={mode === 'two' ? () => setInsightsOpen(true) : undefined}
        />
        {draft.conflict ? (
          <div className="dk-banner" role="alert">
            <span>This deck changed in another tab or device. Reload to see that copy, or keep your edits and overwrite it.</span>
            <Button size="sm" variant="secondary" onClick={() => draft.resolveConflict('reload')}>
              Reload
            </Button>
            <Button size="sm" onClick={() => draft.resolveConflict('keep')}>
              Keep mine
            </Button>
          </div>
        ) : null}
        {tabbed ? (
          <>
            <Tabs<PaneId>
              className="dk-tabs"
              label="Builder views"
              value={pane}
              onValueChange={setPane}
              items={TAB_PANES.map((id) => ({
                value: id,
                label: PANE_LABELS[id],
                count: id === 'deck' ? totalCount(deck.main) : id === 'insights' && errorCount > 0 ? errorCount : undefined,
                content: panes[id],
              }))}
            />
            <ActionBar onInsights={() => setPane('insights')} />
          </>
        ) : (
          <>
            <div className="dk-sectionbar">
              <SectionSwitch />
            </div>
            <div className={`dk-panes dk-panes--${mode}`}>
              {paneIds.map((id) => (
                <div key={id} className={`dk-pane dk-pane--${id}`}>
                  <h2 className="dk-pane__title">{PANE_LABELS[id]}</h2>
                  <div className="dk-pane__body">{panes[id]}</div>
                </div>
              ))}
            </div>
          </>
        )}
        <Drawer open={insightsOpen && mode === 'two'} onClose={() => setInsightsOpen(false)} title="Insights" side="right">
          <InsightsPane />
        </Drawer>
        <LegendChangeDialog open={legendOpen} onClose={() => setLegendOpen(false)} />
        <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      </div>
    </BuilderProvider>
  );
}

function BuilderLoader({ deckId }: { deckId: string | undefined }) {
  const draft = useDeckDraft(deckId);
  const owned = useOwned();
  const allDecks = useDecks();
  if (draft.deck === null) return <NotFound />;
  if (draft.deck === undefined || owned === undefined || allDecks === undefined) return <Loading />;
  return <Builder deck={draft.deck} draft={draft} owned={owned} allDecks={allDecks} />;
}

/** Legend-first deck builder: card pool, deck and insights, saved as you go. */
export default function DeckBuilderPage() {
  const { deckId } = useParams();
  return <BuilderLoader key={deckId} deckId={deckId} />;
}
