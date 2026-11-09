/** Pure models for the decks list and the new deck legend picker. */
import {
  deckCompletion,
  validateDeck,
  type Card,
  type Catalog,
  type Deck,
  type DeckCompletion,
  type LegendReadiness,
} from '@sc/core';
import { NEW_DECK_SUFFIX, type DeckSort, type LegendSort } from './constants';
import { totalCount } from './deckModel';
import { validity, type ValidityTone } from './insightsModel';

export interface DeckSummary {
  deck: Deck;
  completion: DeckCompletion;
  tone: ValidityTone;
  validityLabel: string;
  errors: number;
  warnings: number;
  counts: { main: number; runes: number; battlefields: number; sideboard: number };
  legend: Card | undefined;
}

export function summarizeDeck(deck: Deck, catalog: Catalog): DeckSummary {
  const issues = validateDeck(deck, catalog);
  const { tone, label } = validity(issues);
  return {
    deck,
    completion: deckCompletion(deck, catalog),
    tone,
    validityLabel: label,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    counts: {
      main: totalCount(deck.main),
      runes: totalCount(deck.runes),
      battlefields: totalCount(deck.battlefields),
      sideboard: totalCount(deck.sideboard),
    },
    legend: deck.legendKey ? catalog.cards[deck.legendKey] : undefined,
  };
}

/** Case-insensitive match on deck name, tags, or legend name. */
export function matchesDeckSearch(summary: DeckSummary, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [summary.deck.name, summary.legend?.name ?? '', ...(summary.deck.tags ?? [])];
  return haystack.some((text) => text.toLowerCase().includes(needle));
}

export function sortSummaries(list: DeckSummary[], sort: DeckSort): DeckSummary[] {
  const byName = (a: DeckSummary, b: DeckSummary) => a.deck.name.localeCompare(b.deck.name);
  const compare: Record<DeckSort, (a: DeckSummary, b: DeckSummary) => number> = {
    recent: (a, b) => b.deck.updatedAt - a.deck.updatedAt,
    name: byName,
    completeness: (a, b) => b.completion.percent - a.completion.percent || byName(a, b),
  };
  return [...list].sort(compare[sort]);
}

export function defaultDeckName(legend: Card): string {
  const first = legend.name.split(',')[0]?.trim() || legend.name;
  return `${first} ${NEW_DECK_SUFFIX}`;
}

export interface LegendOption {
  legend: Card;
  readiness: LegendReadiness | undefined;
}

export function legendOptions(catalog: Catalog, readiness: LegendReadiness[]): LegendOption[] {
  const byKey = new Map(readiness.map((r) => [r.legendKey, r]));
  return Object.values(catalog.cards)
    .filter((card) => card.type === 'Legend')
    .map((legend) => ({ legend, readiness: byKey.get(legend.cardKey) }));
}

/** Fully buildable legends first, then the rest; each tier by score. Core order is kept for ties. */
export function rankReadiness(list: LegendReadiness[]): LegendReadiness[] {
  const tier = (r: LegendReadiness) => (r.shortBy === 0 ? 0 : 1);
  return [...list].sort((a, b) => tier(a) - tier(b) || b.score - a.score);
}

function readyRank(o: LegendOption): [number, number] {
  const r = o.readiness;
  return [r && r.shortBy === 0 ? 0 : 1, -(r?.score ?? -1)];
}

export function filterLegends(options: LegendOption[], search: string, sort: LegendSort): LegendOption[] {
  const needle = search.trim().toLowerCase();
  const hit = (o: LegendOption) =>
    !needle ||
    [o.legend.name, ...o.legend.tags, ...o.legend.domains].some((text) => text.toLowerCase().includes(needle));
    const byName = (a: LegendOption, b: LegendOption) => a.legend.name.localeCompare(b.legend.name);
  return options.filter(hit).sort(sort === 'name' ? byName : (a, b) => readyRank(a)[0] - readyRank(b)[0] || readyRank(a)[1] - readyRank(b)[1] || byName(a, b));
}

/** Plain language headline for a legend's readiness. */
export function readinessLine(r: LegendReadiness | undefined): string {
  if (!r) return 'No collection data yet';
  if (r.shortBy === 0) return 'Ready to build';
  return `${r.shortBy} short of a full deck`;
}
