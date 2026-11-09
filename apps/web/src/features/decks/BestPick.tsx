import type { Catalog, LegendReadiness } from '@sc/core';
import { Badge, Button } from '../../ui';
import { percent } from './insightsModel';
import { DomainRow, LegendArt } from './LegendArt';
import { rankReadiness, readinessLine } from './listModel';

interface BestPickProps {
  catalog: Catalog;
  readiness: LegendReadiness[];
  onStart: (legendKey: string) => void;
}

/** The single best legend to start from with the current collection. */
export function BestPick({ catalog, readiness, onStart }: BestPickProps) {
  const best = rankReadiness(readiness)[0];
  const legend = best ? catalog.cards[best.legendKey] : undefined;
  if (!best || !legend) return null;
  return (
    <section className="dk-best" aria-label="Start here">
      <LegendArt catalog={catalog} legend={legend} className="dk-best__art" />
      <div className="dk-best__body">
        <Badge tone="accent">Start here</Badge>
        <h2 className="dk-best__name">{legend.name}</h2>
        <DomainRow domains={legend.domains} />
        <p className="dk-muted">
          {percent(best.completeness)}% of a full deck owned. {readinessLine(best)}
          {best.championAvailable ? '' : ', no champion owned yet'}.
        </p>
        <Button icon="plus" onClick={() => onStart(best.legendKey)} aria-label={`Build ${legend.name}`}>
          Build this deck
        </Button>
      </div>
    </section>
  );
}
