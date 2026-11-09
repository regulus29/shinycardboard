/** Pure card pool model: legal cards for a section, search, scope and filters. */
import { defaultRules, runSearch, type Card, type CardType, type Catalog, type Domain, type Printing, type RulesConfig, type SearchContext } from '@sc/core';
import type { DeckSection } from '@sc/core';
import { ENERGY_BUCKET_MAX, type CardOrder, type PoolScope } from './constants';
import { isChampionCard, sectionAccepts } from './deckModel';

export interface PoolFilters {
  types: CardType[];
  /** Energy buckets; the last bucket means that many or more. */
  energies: number[];
  domains: Domain[];
  championsOnly: boolean;
}

export const NO_FILTERS: PoolFilters = { types: [], energies: [], domains: [], championsOnly: false };

export function hasActiveFilters(filters: PoolFilters): boolean {
  return filters.types.length + filters.energies.length + filters.domains.length > 0 || filters.championsOnly;
}

export interface PoolEntry {
  card: Card;
  /** Printing shown for the card: the best search hit, or the standard printing. */
  printing: Printing;
  owned: number;
}

export interface PoolRequest {
  catalog: Catalog;
  /** Cards legal for the deck legend, from core legalCards. */
  legal: Card[];
  section: DeckSection;
  query: string;
  context: SearchContext | undefined;
  ownedByCard: Record<string, number>;
  scope: PoolScope;
  filters: PoolFilters;
  order: CardOrder;
  rules?: RulesConfig;
}

export function energyBucket(energy: number | null): number | null {
  return energy === null ? null : Math.min(Math.max(0, Math.floor(energy)), ENERGY_BUCKET_MAX);
}

export function matchesFilters(card: Card, filters: PoolFilters, rules: RulesConfig = defaultRules): boolean {
  if (filters.types.length && !filters.types.includes(card.type)) return false;
  if (filters.energies.length) {
    const bucket = energyBucket(card.energy);
    if (bucket === null || !filters.energies.includes(bucket)) return false;
  }
  if (filters.domains.length && !card.domains.some((domain) => filters.domains.includes(domain))) return false;
  return !filters.championsOnly || isChampionCard(card, rules);
}

function orderCards(cards: Card[], order: CardOrder): Card[] {
  const energy = (card: Card) => card.energy ?? Number.POSITIVE_INFINITY;
  const byName = (a: Card, b: Card) => a.name.localeCompare(b.name);
  return [...cards].sort(order === 'name' ? byName : (a, b) => energy(a) - energy(b) || byName(a, b));
}

/** Search order wins when there is a query: one entry per card, best hit first. */
function queryOrder(request: PoolRequest, allowed: Map<string, Card>): { card: Card; printing: Printing }[] {
  const { catalog, context, query } = request;
  if (!context) return [];
  const seen = new Set<string>();
  const out: { card: Card; printing: Printing }[] = [];
  for (const hit of runSearch(query, catalog, context, { sort: 'relevance' }).hits) {
    const card = allowed.get(hit.card.cardKey);
    if (!card || seen.has(card.cardKey)) continue;
    seen.add(card.cardKey);
    out.push({ card, printing: hit.printing });
  }
  return out;
}

function standardPrinting(card: Card, catalog: Catalog): Printing | undefined {
  return card.printingKeys.map((key) => catalog.printings[key]).find((p): p is Printing => p !== undefined);
}

/** Cards a user can add right now, legal for the legend and the active section. */
export function buildPool(request: PoolRequest): PoolEntry[] {
  const rules = request.rules ?? defaultRules;
  const allowed = new Map(request.legal.filter((card) => sectionAccepts(card, request.section, rules)).map((card) => [card.cardKey, card]));
  const base = request.query.trim()
    ? queryOrder(request, allowed)
    : orderCards([...allowed.values()], request.order).flatMap((card) => {
        const printing = standardPrinting(card, request.catalog);
        return printing ? [{ card, printing }] : [];
      });
  return base
    .map(({ card, printing }) => ({ card, printing, owned: request.ownedByCard[card.cardKey] ?? 0 }))
    .filter((entry) => request.scope === 'all' || entry.owned > 0)
    .filter((entry) => matchesFilters(entry.card, request.filters, rules));
}

/** Types that appear in the pool for a section, for the type filter chips. */
export function typesForSection(section: DeckSection, rules: RulesConfig = defaultRules): CardType[] {
  const c = rules.classification;
  if (section === 'runes') return [c.runeType as CardType];
  if (section === 'battlefields') return [c.battlefieldType as CardType];
  return [...(section === 'main' ? c.mainDeckTypes : c.sideboardTypes)] as CardType[];
}
