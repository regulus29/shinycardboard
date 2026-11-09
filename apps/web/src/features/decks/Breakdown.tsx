import type { LegendReadiness } from '@sc/core';
import { ProgressBar } from '../../ui';

const PARTS = [
  { key: 'legend', label: 'Legend' },
  { key: 'main', label: 'Main deck' },
  { key: 'runes', label: 'Runes' },
  { key: 'battlefields', label: 'Battlefields' },
] as const;

/** The honest per section breakdown behind a legend's readiness. */
export function Breakdown({ readiness }: { readiness: LegendReadiness }) {
  return (
    <ul className="dk-breakdown" aria-label="Collection breakdown">
      {PARTS.map(({ key, label }) => {
        const fill = readiness.sections[key];
        return (
          <li key={key} className="dk-breakdown__row">
            <span className="dk-breakdown__label">{label}</span>
            <ProgressBar value={fill.have} max={Math.max(1, fill.need)} label={`${label} owned`} size="sm" tone={fill.have >= fill.need ? 'success' : 'accent'} />
            <span className="dk-breakdown__count">
              {fill.have}/{fill.need}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
