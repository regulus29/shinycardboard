import { useEffect, useMemo, useState } from 'react';
import { drawHand, mulligan, seededRng } from '@sc/core';
import { Button, CardImage, cx } from '../../ui';
import { useBuilder } from './builderContext';
import { SAMPLE_SEED_RANGE } from './constants';
import { artUrl } from './LegendArt';
import { totalCount } from './deckModel';

const newSeed = () => Math.floor(Math.random() * SAMPLE_SEED_RANGE);

/** Draw a seeded opening hand and try the mulligan the rules allow. */
export function SampleHandPanel() {
  const { deck, catalog, rules } = useBuilder();
  const [seed, setSeed] = useState(newSeed);
  const [marked, setMarked] = useState<number[]>([]);
  const [applied, setApplied] = useState<number[]>([]);
  const mainCount = totalCount(deck.main);

  const base = useMemo(
    () => drawHand(deck, catalog, rules.openingHandSize, seededRng(seed), rules),
    // Only the main list, legend and champion change what is drawn.
    [deck.main, deck.chosenChampionKey, deck.legendKey, catalog, rules, seed],
  );
  const state = useMemo(() => (applied.length ? mulligan(base, applied, rules) : base), [base, applied, rules]);

  useEffect(() => {
    setMarked([]);
    setApplied([]);
  }, [seed, deck.main]);

  const nameOf = (key: string) => catalog.cards[key]?.name ?? key;
  const toggle = (index: number) =>
    setMarked((list) => (list.includes(index) ? list.filter((i) => i !== index) : list.length < rules.mulliganMax ? [...list, index] : list));
  const redraw = () => setSeed(newSeed());

  return (
    <section className="dk-panel" aria-labelledby="dk-hand-title">
      <header className="dk-panel__head">
        <h2 id="dk-hand-title" className="dk-panel__title">
          Sample hand
        </h2>
        <Button variant="secondary" size="sm" icon="dice" onClick={redraw} disabled={mainCount === 0}>
          New seed
        </Button>
      </header>
      {mainCount === 0 ? (
        <p className="dk-muted">Add cards to the main deck to draw an opening hand.</p>
      ) : (
        <>
          <p className="dk-muted">
            Seed {seed}. Opening hand of {rules.openingHandSize}; mulligan up to {rules.mulliganMax}.
          </p>
          <ul className="dk-hand" aria-label="Opening hand">
            {state.hand.map((key, index) => (
              <li key={`${key}-${index}`}>
                <button type="button" className={cx('dk-hand__card', marked.includes(index) && 'is-marked')} aria-pressed={marked.includes(index)} aria-label={`${nameOf(key)}${applied.length ? '' : ', mark for mulligan'}`} disabled={applied.length > 0} onClick={() => toggle(index)}>
                  <CardImage src={artUrl(catalog, catalog.cards[key])} alt="" />
                  <span className="dk-hand__name">{nameOf(key)}</span>
                </button>
              </li>
            ))}
          </ul>
          {state.champion ? (
            <p className="dk-hand__champion">
              Set aside in the champion zone: <strong>{nameOf(state.champion)}</strong>
            </p>
          ) : null}
          <div className="dk-actions">
            <Button size="sm" disabled={marked.length === 0 || applied.length > 0} onClick={() => {
                setApplied(marked);
                setMarked([]);
              }}>
              Mulligan marked ({marked.length}/{rules.mulliganMax})
            </Button>
            <Button size="sm" variant="ghost" onClick={redraw}>
              Draw again
            </Button>
          </div>
          <p className="dk-muted" role="status">
            {applied.length > 0
              ? `Mulligan used: replaced ${applied.length} of ${rules.mulliganMax} cards. No more mulligans.`
              : `Mulligan available: replace up to ${rules.mulliganMax} cards.`}{' '}
            {state.library.length} cards left in the library.
          </p>
        </>
      )}
    </section>
  );
}
