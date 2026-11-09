import type { Card } from '@sc/core';
import { CardImage, cx } from '../../ui';
import { useBuilder } from './builderContext';
import { artUrl } from './LegendArt';

function Pinned({ label, card, empty, onClick }: { label: string; card: Card | undefined; empty: string; onClick?: () => void }) {
  const { catalog, ownedCounts } = useBuilder();
  const owned = card ? (ownedCounts[card.cardKey] ?? 0) : 0;
  return (
    <button type="button" className={cx('dk-pinned', !card && 'is-empty')} onClick={onClick}>
      <span className="dk-pinned__art">{card ? <CardImage src={artUrl(catalog, card)} alt="" /> : null}</span>
      <span className="dk-pinned__text">
        <span className="dk-pinned__label">{label}</span>
        <span className="dk-pinned__name">{card ? card.name : empty}</span>
        {card ? <span className="dk-pinned__owned">{owned > 0 ? `${owned} owned` : 'Not owned'}</span> : null}
      </span>
    </button>
  );
}

/** The legend and chosen champion stay visible above the pool. */
export function PinnedCards() {
  const { legend, chosenChampion, openLegendPicker, setSection, setPool, pool } = useBuilder();
  return (
    <div className="dk-pinned-row">
      <Pinned label="Legend" card={legend} empty="Choose a legend" onClick={openLegendPicker} />
      <Pinned
        label="Chosen champion"
        card={chosenChampion}
        empty="Pick a champion"
        onClick={() => {
          setSection('main');
          setPool({ filters: { ...pool.filters, championsOnly: true } });
        }}
      />
    </div>
  );
}
