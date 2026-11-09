import type { Catalog, LegendReadiness } from '@sc/core';
import { Badge, Button, ProgressBar } from '../../ui';
import { Breakdown } from './Breakdown';
import { percent } from './insightsModel';
import { LegendArt } from './LegendArt';
import { rankReadiness, readinessLine } from './listModel';

import { BUILDABLE_TOP } from './constants';

interface BuildablePanelProps {
  catalog: Catalog;
  readiness: LegendReadiness[];
  hasCollection: boolean;
  onStart: (legendKey: string) => void;
  onBrowse: () => void;
}

/** Ranks legends by how much of a full deck the collection already covers. */
export function BuildablePanel({ catalog, readiness, hasCollection, onStart, onBrowse }: BuildablePanelProps) {
  const top = rankReadiness(readiness).slice(0, BUILDABLE_TOP);
  return (
    <section className="dk-panel dk-buildable" aria-labelledby="dk-buildable-title">
      <header className="dk-panel__head">
        <h2 id="dk-buildable-title" className="dk-panel__title">
          What can I build?
        </h2>
        <Button variant="ghost" size="sm" onClick={onBrowse}>
          All legends
        </Button>
      </header>
      {!hasCollection ? (
        <p className="dk-muted">Add cards to your collection and the legends you are closest to finishing will show up here.</p>
      ) : (
        <ol className="dk-buildable__list">
          {top.map((entry, index) => {
            const legend = catalog.cards[entry.legendKey];
            if (!legend) return null;
            return (
              <li key={entry.legendKey} className="dk-buildable__item">
                <LegendArt catalog={catalog} legend={legend} className="dk-buildable__art" />
                <div className="dk-buildable__body">
                  <div className="dk-buildable__top">
                    <span className="dk-buildable__rank">{index + 1}</span>
                    <span className="dk-buildable__name">{legend.name}</span>
                    <Badge tone={entry.shortBy === 0 ? 'success' : 'neutral'}>{percent(entry.completeness)}%</Badge>
                  </div>
                  <ProgressBar value={percent(entry.completeness)} label={`${legend.name} completeness`} size="sm" tone={entry.shortBy === 0 ? 'success' : 'accent'} />
                  <p className="dk-muted">{readinessLine(entry)}{entry.championAvailable ? '' : ', no champion owned yet'}</p>
                  <Breakdown readiness={entry} />
                  <Button size="sm" variant="secondary" icon="plus" onClick={() => onStart(entry.legendKey)} aria-label={`Start from ${legend.name}`}>
                    Start from this legend
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
