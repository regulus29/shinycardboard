import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, PageHeader, ProgressBar, Skeleton, Switch } from '../../ui';
import { useOwned, useRequiredCatalog } from '../../data';
import { VARIANT_LABELS } from './constants';
import { pluralize } from './format';
import { computeSetProgress, isPromoSet, overallProgress, setLink, type SetProgress } from './sets';
import './collection.css';

function SetCard({ set, standardOnly }: { set: SetProgress; standardOnly: boolean }) {
  const percent = set.total === 0 ? 0 : Math.round((set.owned / set.total) * 100);
  return (
    <li className="set-card">
      <header className="set-card__header">
        <div>
          <h2 className="set-card__title">{set.label}</h2>
          <p className="set-card__code">{set.setId}</p>
        </div>
        {set.complete ? <Badge tone="success">Complete</Badge> : <span className="set-card__percent">{percent}%</span>}
      </header>
      <ProgressBar
        value={set.owned}
        max={Math.max(1, set.total)}
        label={`${set.label} completion`}
        tone={set.complete ? 'success' : 'accent'}
        showValue
      />
      <ul className="set-card__variants" aria-label={`${set.label} variants`}>
        {set.variants.map((variant) => (
          <li key={variant.variant} className="set-card__variant">
            <span>{VARIANT_LABELS[variant.variant] ?? variant.variant}</span>
            <span className="set-card__variant-count">
              {variant.owned} / {variant.total}
            </span>
            <ProgressBar value={variant.owned} max={Math.max(1, variant.total)} label={`${set.label} ${variant.variant}`} size="sm" tone={variant.owned === variant.total ? 'success' : 'accent'} />
          </li>
        ))}
      </ul>
      <footer className="set-card__links">
        <Link to={setLink(set.setId, null, standardOnly)}>Browse</Link>
        <Link to={setLink(set.setId, 'owned', standardOnly)}>Owned</Link>
        <Link to={setLink(set.setId, 'missing', standardOnly)}>{pluralize(set.total - set.owned, 'printing')} missing</Link>
      </footer>
    </li>
  );
}

/** Completion per set with a standard-only toggle, a per-variant breakdown and links into the collection. */
export default function SetsPage() {
  const catalog = useRequiredCatalog();
  const owned = useOwned();
  const [standardOnly, setStandardOnly] = useState(true);
  const progress = useMemo(
    () => (owned ? computeSetProgress(catalog, new Set(owned.map((entry) => entry.printingKey)), standardOnly) : null),
    [catalog, owned, standardOnly],
  );
  const main = progress?.filter((set) => !isPromoSet(set)) ?? [];
  const complete = main.filter((set) => set.complete).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Library"
        title="Sets"
        subtitle={progress ? `${complete} of ${main.length} main sets complete - ${Math.round(overallProgress(progress) * 100)}% of ${standardOnly ? 'standard printings' : 'all printings'}` : 'Loading'}
        actions={<Switch checked={standardOnly} onCheckedChange={setStandardOnly} label="Standard printings only" />}
      />
      {progress ? (
        <ul className="sets-grid">
          {progress.map((set) => (
            <SetCard key={set.setId} set={set} standardOnly={standardOnly} />
          ))}
        </ul>
      ) : (
        <div className="sets-grid" role="status" aria-label="Loading sets">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height="14rem" />
          ))}
        </div>
      )}
    </div>
  );
}
