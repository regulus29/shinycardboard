import { useMemo, useState } from 'react';
import { buildableLegends } from '@sc/core';
import { clock, deleteDeck, duplicateDeck, saveDeck, useDecks, useOwned, useRequiredCatalog } from '../../data';
import { useNavigate } from 'react-router-dom';
import { paths } from '../../app/paths';
import { Button, EmptyState, PageHeader, SearchField, Select, Skeleton, useToast } from '../../ui';
import { BestPick } from './BestPick';
import { BuildablePanel } from './BuildablePanel';
import { DECK_SORT_OPTIONS, type DeckSort } from './constants';
import { DeckCard } from './DeckCard';
import { ImportDeckDialog } from './ImportDeckDialog';
import { matchesDeckSearch, sortSummaries, summarizeDeck, type DeckSummary } from './listModel';
import { NewDeckDialog } from './NewDeckDialog';
import { useStartDeck } from './useStartDeck';
import './decks.css';

/** The deck list: every deck at a glance, plus a way to start a new one from the collection. */
export default function DecksPage() {
  const catalog = useRequiredCatalog();
  const decks = useDecks();
  const owned = useOwned();
  const toast = useToast();
  const navigate = useNavigate();
  const startDeck = useStartDeck();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<DeckSort>('recent');
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const readiness = useMemo(() => (owned ? buildableLegends(catalog, owned) : []), [catalog, owned]);
  const summaries = useMemo(() => (decks ?? []).map((deck) => summarizeDeck(deck, catalog)), [decks, catalog]);
  const shown = useMemo(() => sortSummaries(summaries.filter((s) => matchesDeckSearch(s, search)), sort), [summaries, search, sort]);
  const hasCollection = (owned?.length ?? 0) > 0;
  const now = clock.now();

  const duplicate = async (summary: DeckSummary) => {
    const copy = await duplicateDeck(summary.deck.id);
    if (copy) toast.show({ title: 'Duplicated', description: copy.name, tone: 'success', action: { label: 'Open', onClick: () => navigate(paths.deck(copy.id)) } });
  };

  const remove = async (summary: DeckSummary) => {
    await deleteDeck(summary.deck.id);
    toast.show({
      title: 'Deck deleted',
      description: summary.deck.name,
      tone: 'info',
      action: { label: 'Undo', onClick: () => void saveDeck({ id: summary.deck.id }, { revive: true }) },
    });
  };

  const actions = (
    <>
      <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>
        Import
      </Button>
      <Button icon="plus" onClick={() => setNewOpen(true)}>
        New deck
      </Button>
    </>
  );

  return (
    <div className="page dk-page">
      <PageHeader eyebrow="Workshop" title="Decks" subtitle={decks ? (decks.length === 1 ? '1 deck' : `${decks.length} decks`) : undefined} actions={actions} />
      {hasCollection ? <BestPick catalog={catalog} readiness={readiness} onStart={(key) => void startDeck(key)} /> : null}
      <div className="dk-decks-layout">
        <div className="dk-decks-main">
          {decks === undefined ? (
            <Skeleton height="9rem" />
          ) : decks.length === 0 ? (
            <EmptyState
              illustration="deck"
              title="Build your first deck"
              description="Pick a legend and the builder checks every card against the rules as you go. Your collection decides which cards are ready to play."
              action={
                <>
                  <Button icon="plus" onClick={() => setNewOpen(true)}>
                    Choose a legend
                  </Button>
                  <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>
                    Import a deck list
                  </Button>
                </>
              }
            />
          ) : (
            <>
              <div className="dk-toolbar">
                <SearchField label="Search decks" value={search} onValueChange={setSearch} placeholder="Search by name, tag or legend" />
                <Select label="Sort decks" hideLabel value={sort} onValueChange={setSort} options={DECK_SORT_OPTIONS} />
              </div>
              {shown.length === 0 ? (
                <EmptyState icon="search" title="No decks match" description="Try a different name or tag." />
              ) : (
                <ul className="dk-deck-grid" aria-label="Decks">
                  {shown.map((summary) => (
                    <DeckCard key={summary.deck.id} summary={summary} catalog={catalog} now={now} onDuplicate={() => void duplicate(summary)} onDelete={() => void remove(summary)} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <aside className="dk-decks-side" aria-label="Collection suggestions">
          <BuildablePanel catalog={catalog} readiness={readiness} hasCollection={hasCollection} onStart={(key) => void startDeck(key)} onBrowse={() => setNewOpen(true)} />
        </aside>
      </div>

      <NewDeckDialog open={newOpen} onClose={() => setNewOpen(false)} catalog={catalog} readiness={readiness} />
      <ImportDeckDialog open={importOpen} onClose={() => setImportOpen(false)} catalog={catalog} />
    </div>
  );
}
