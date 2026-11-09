import { useState } from 'react';
import { Link } from 'react-router-dom';
import { paths } from '../../app/paths';
import { Button, Icon, useToast } from '../../ui';
import { useBuilder } from './builderContext';
import { copyText } from './clipboard';
import { CONFLICTS_PREVIEW } from './constants';
import { sharedCopies, shoppingList } from './insightsModel';

/** Cards the deck needs that the collection does not cover, and decks competing for the same copies. */
export function MissingPanel() {
  const { missing, conflicts, catalog, allDecks, deck, retired } = useBuilder();
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const nameOf = (key: string) => catalog.cards[key]?.name ?? key;
  const total = missing.reduce((sum, m) => sum + m.missing, 0);
  const shared = sharedCopies(conflicts);
  const ranked = [...conflicts].sort((a, b) => b.demanded - b.owned - (a.demanded - a.owned) || a.cardKey.localeCompare(b.cardKey));
  const shownConflicts = showAll ? ranked : ranked.slice(0, CONFLICTS_PREVIEW);

  const copy = async () => {
    const ok = await copyText(shoppingList(missing, catalog));
    toast.show({ title: ok ? 'Shopping list copied' : 'Could not copy', tone: ok ? 'success' : 'danger' });
  };

  return (
    <>
      <section className="dk-panel" aria-labelledby="dk-missing-title">
        <header className="dk-panel__head">
          <h2 id="dk-missing-title" className="dk-panel__title">
            Missing cards
          </h2>
          {missing.length > 0 ? (
            <Button variant="secondary" size="sm" icon="copy" onClick={() => void copy()}>
              Copy shopping list
            </Button>
          ) : null}
        </header>
        {missing.length === 0 ? (
          <p className="dk-ok">
            <Icon name="check" />
            {shared > 0
              ? `Your collection covers every card, but ${shared} ${shared === 1 ? 'copy is' : 'copies are'} shared with other decks.`
              : 'Your collection covers every card in this deck.'}
          </p>
        ) : (
          <>
            <p className="dk-muted">
              {total} {total === 1 ? 'copy' : 'copies'} short across {missing.length} {missing.length === 1 ? 'card' : 'cards'}.
            </p>
            <ul className="dk-table" aria-label="Missing cards">
              {missing.map((entry) => (
                <li key={entry.cardKey}>
                  <span className="dk-table__name">{nameOf(entry.cardKey)}</span>
                  <span className="dk-muted">
                    own {entry.owned} of {entry.needed}
                  </span>
                  <strong className="dk-table__miss">-{entry.missing}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
        {retired.length > 0 ? (
          <p className="dk-muted" role="note">
            {retired.length} retired {retired.length === 1 ? 'card' : 'cards'} in this deck no longer exist in the catalog and are left out of the shopping list. Remove them from the deck.
          </p>
        ) : null}
      </section>
      {conflicts.length > 0 ? (
        <section className="dk-panel" aria-labelledby="dk-conflict-title">
          <h2 id="dk-conflict-title" className="dk-panel__title">
            Shared with other decks
          </h2>
          <p className="dk-muted">You own fewer copies than these decks ask for together.</p>
          <ul className="dk-table" aria-label="Allocation conflicts">
            {shownConflicts.map((entry) => (
              <li key={entry.cardKey} className="dk-table__stack">
                <span className="dk-table__name">{nameOf(entry.cardKey)}</span>
                <span className="dk-muted">
                  own {entry.owned}, decks want {entry.demanded}
                </span>
                <span className="dk-conflict__decks">
                  {entry.decks
                    .filter((id) => id !== deck.id)
                    .map((id) => (
                      <Link key={id} to={paths.deck(id)}>
                        {allDecks.find((d) => d.id === id)?.name ?? 'Another deck'}
                      </Link>
                    ))}
                </span>
              </li>
            ))}
          </ul>
          {ranked.length > CONFLICTS_PREVIEW ? (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${ranked.length}`}
            </Button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
