import { Link } from 'react-router-dom';
import { paths } from '../../app/paths';
import { Button, ProgressBar } from '../../ui';
import type { CollectionSummary } from './stats';

interface StatsStripProps {
  summary: CollectionSummary;
  onImport: () => void;
  onQuickAdd: () => void;
}

interface Stat {
  label: string;
  value: string;
  hint?: string;
}

/** Collection summary shown above the results: copies, unique printings, unique cards, main sets completed. */
export function StatsStrip({ summary, onImport, onQuickAdd }: StatsStripProps) {
  const stats: Stat[] = [
    { label: 'Copies owned', value: summary.copies.toLocaleString() },
    { label: 'Unique printings', value: summary.uniquePrintings.toLocaleString(), hint: `of ${summary.totalPrintings.toLocaleString()}` },
    { label: 'Unique cards', value: summary.uniqueCards.toLocaleString(), hint: `of ${summary.totalCards.toLocaleString()}` },
    { label: 'Main sets complete', value: `${summary.mainSetsComplete}`, hint: `of ${summary.mainSets}` },
  ];

  return (
    <section className="stats" aria-label="Collection summary">
      <dl className="stats__grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stats__item">
            <dt className="stats__label">{stat.label}</dt>
            <dd className="stats__value">
              {stat.value}
              {stat.hint ? <span className="stats__hint">{stat.hint}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <div className="stats__progress">
        {summary.copies === 0 ? (
          <div className="stats__welcome">
            <p>Your collection is empty. Turn on quick add and tap cards to log what you own, or import a CSV.</p>
            <div className="stats__actions">
              <Button variant="primary" size="sm" icon="plus" onClick={onQuickAdd}>
                Start quick add
              </Button>
              <Button variant="secondary" size="sm" icon="upload" onClick={onImport}>
                Import
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="stats__percent">{summary.percentOwned}% of printings owned</p>
            <ProgressBar value={summary.uniquePrintings} max={Math.max(1, summary.totalPrintings)} label="Printings owned" size="md" />
            <Link to={paths.sets()} className="stats__link">
              View set completion
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
