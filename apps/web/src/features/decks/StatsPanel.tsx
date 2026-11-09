import { useId } from 'react';
import type { Domain } from '@sc/core';
import { DomainBadge } from '../../ui';
import { useBuilder } from './builderContext';
import { curveBars, curveSummary, type CurveBar } from './insightsModel';

/** Geometry of the inline SVG chart, in viewBox units. */
const CHART = { width: 280, height: 132, padX: 10, top: 18, bottom: 22, gap: 6 } as const;

function CurveChart({ bars, summary }: { bars: CurveBar[]; summary: string }) {
  const titleId = useId();
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  const slot = (CHART.width - CHART.padX * 2) / bars.length;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  return (
    <svg className="dk-chart" viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{summary}</title>
      <line className="dk-chart__axis" x1={CHART.padX} x2={CHART.width - CHART.padX} y1={CHART.height - CHART.bottom} y2={CHART.height - CHART.bottom} />
      {bars.map((bar, i) => {
        const h = (bar.count / max) * plotHeight;
        const x = CHART.padX + i * slot + CHART.gap / 2;
        const y = CHART.height - CHART.bottom - h;
        return (
          <g key={bar.energy}>
            {bar.count > 0 ? <rect className="dk-chart__bar" x={x} y={y} width={slot - CHART.gap} height={h} rx={3} /> : null}
            {bar.count > 0 ? (
              <text className="dk-chart__value" x={x + (slot - CHART.gap) / 2} y={y - 4} textAnchor="middle">
                {bar.count}
              </text>
            ) : null}
            <text className="dk-chart__label" x={x + (slot - CHART.gap) / 2} y={CHART.height - 6} textAnchor="middle">
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Energy curve, type split, domain split and average energy for the main deck. */
export function StatsPanel() {
  const { stats } = useBuilder();
  const bars = curveBars(stats);
  const summary = curveSummary(bars, stats.averageEnergy);
  const types = Object.entries(stats.byType).sort(([, a], [, b]) => b - a);
  const domains = Object.entries(stats.byDomain) as [Domain, number][];
  return (
    <section className="dk-panel" aria-labelledby="dk-stats-title">
      <header className="dk-panel__head">
        <h2 id="dk-stats-title" className="dk-panel__title">
          Stats
        </h2>
        <span className="dk-muted">Average energy {stats.averageEnergy.toFixed(1)}</span>
      </header>
      <CurveChart bars={bars} summary={summary} />
      <p className="dk-sr">{summary}</p>
      {stats.mainCount === 0 ? (
        <p className="dk-muted">Stats appear once the main deck has cards.</p>
      ) : (
        <div className="dk-splits">
          <ul className="dk-split" aria-label="Type split">
            {types.map(([type, count]) => (
              <li key={type}>
                <span>{type}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
          <ul className="dk-split" aria-label="Domain split">
            {domains.map(([domain, count]) => (
              <li key={domain}>
                <DomainBadge domain={domain} />
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
