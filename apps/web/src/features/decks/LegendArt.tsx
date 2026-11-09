import { useState, type CSSProperties } from 'react';
import type { Card, Catalog, Domain } from '@sc/core';
import { DomainBadge, cx, domainColorVar } from '../../ui';

/** The first printing's art for a card, or undefined when the catalog has none. */
export function artUrl(catalog: Catalog, card: Card | undefined, printingKey?: string): string | undefined {
  if (!card) return undefined;
  const pinned = printingKey ? catalog.printings[printingKey] : undefined;
  const first = card.printingKeys.map((key) => catalog.printings[key]).find(Boolean);
  return (pinned ?? first)?.imageUrl || undefined;
}

interface LegendArtProps {
  catalog: Catalog;
  legend: Card | undefined;
  className?: string;
}

/** Cropped banner of a legend card. Cover fit keeps it correct for any card orientation; a domain gradient stands in offline. */
export function LegendArt({ catalog, legend, className }: LegendArtProps) {
  const url = artUrl(catalog, legend);
  const [failed, setFailed] = useState(false);
  const domain = legend?.domains[0];
  const style = domain ? ({ '--legend-color': domainColorVar(domain) } as CSSProperties) : undefined;
  return (
    <div className={cx('dk-legend-art', className)} style={style} aria-hidden="true">
      {url && !failed ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : null}
    </div>
  );
}

export function DomainRow({ domains }: { domains: Domain[] }) {
  if (domains.length === 0) return null;
  return (
    <span className="dk-domains">
      {domains.map((domain) => (
        <DomainBadge key={domain} domain={domain} compact />
      ))}
    </span>
  );
}
