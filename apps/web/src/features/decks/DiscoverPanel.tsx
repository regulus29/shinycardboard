import type { Catalog, LegendReadiness } from '@sc/core';
import { BestPick } from './BestPick';
import { BuildablePanel } from './BuildablePanel';
import { DISCOVER_LIST_LIMIT } from './constants';

interface DiscoverPanelProps {
  catalog: Catalog;
  suggestions: LegendReadiness[];
  hasCollection: boolean;
  hasDecks: boolean;
  onStart: (legendKey: string) => void;
  onBrowse: () => void;
}

/** Deck ideas drawn from the collection. Kept apart from the decks the user already made. */
export function DiscoverPanel({ catalog, suggestions, hasCollection, hasDecks, onStart, onBrowse }: DiscoverPanelProps) {
  return (
    <div className="dk-discover">
      {hasCollection && !hasDecks ? <BestPick catalog={catalog} readiness={suggestions} onStart={onStart} /> : null}
      <BuildablePanel catalog={catalog} readiness={suggestions} hasCollection={hasCollection} onStart={onStart} onBrowse={onBrowse} limit={DISCOVER_LIST_LIMIT} />
    </div>
  );
}
