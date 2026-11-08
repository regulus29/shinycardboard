import type { Card, Catalog, Deck, DeckSlot, Domain, OwnedEntry } from '../types';
import rulesConfig from '../rules/rules.config.json';

export type RulesConfig = typeof rulesConfig;
export const defaultRules: RulesConfig = rulesConfig;

export type IssueSeverity = 'error' | 'warning';
export interface DeckIssue {
  severity: IssueSeverity;
  code:
    | 'no-legend'
    | 'main-size'
    | 'no-champion'
    | 'copy-limit'
    | 'domain-identity'
    | 'rune-size'
    | 'rune-domain'
    | 'battlefield-count'
    | 'battlefield-duplicate'
    | 'sideboard-size'
    | 'signature-mismatch'
    | 'unknown-card';
  message: string;
  cardKey?: string;
}

export interface DeckStats {
  mainCount: number;
  curve: Record<number, number>;
  byType: Record<string, number>;
  byDomain: Partial<Record<Domain, number>>;
  averageEnergy: number;
}

export interface MissingEntry {
  cardKey: string;
  needed: number;
  owned: number;
  missing: number;
}

/** Rule check. Data driven: reads every limit from RulesConfig. Never throws on bad data. */
export function validateDeck(_deck: Deck, _catalog: Catalog, _rules?: RulesConfig): DeckIssue[] {
  throw new Error('not implemented');
}

export function deckStats(_deck: Deck, _catalog: Catalog): DeckStats {
  throw new Error('not implemented');
}

/** Owned copies per cardKey, summed across printings and finishes. */
export function ownedByCard(_owned: OwnedEntry[], _catalog: Catalog): Record<string, number> {
  throw new Error('not implemented');
}

/** Cards a deck needs beyond what is owned (all slots in main, runes, battlefields, sideboard). */
export function missingCards(_deck: Deck, _owned: OwnedEntry[], _catalog: Catalog): MissingEntry[] {
  throw new Error('not implemented');
}

/** Cards where total demand across the given decks exceeds the owned count. */
export function allocationConflicts(
  _decks: Deck[],
  _owned: OwnedEntry[],
  _catalog: Catalog,
): { cardKey: string; owned: number; demanded: number; decks: string[] }[] {
  throw new Error('not implemented');
}

/** Cards legal to add to a deck given its legend (domain identity, signature rules). */
export function legalCards(_legend: Card | undefined, _catalog: Catalog, _rules?: RulesConfig): Card[] {
  throw new Error('not implemented');
}

export interface LegendReadiness {
  legendKey: string;
  /** 0..1 share of a complete legal deck the collection could fill with owned cards. */
  completeness: number;
  ownedLegalCards: number;
  shortBy: number;
}

/** Rank every legend by how buildable a deck is from the collection. */
export function buildableLegends(
  _catalog: Catalog,
  _owned: OwnedEntry[],
  _rules?: RulesConfig,
): LegendReadiness[] {
  throw new Error('not implemented');
}

export interface FillSuggestion {
  cardKey: string;
  count: number;
  reason: string;
}

/** Suggest owned cards that complete a partial deck (curve gaps, type balance, tags). */
export function suggestFill(
  _deck: Deck,
  _owned: OwnedEntry[],
  _catalog: Catalog,
  _rules?: RulesConfig,
): FillSuggestion[] {
  throw new Error('not implemented');
}

export function totalSlots(slots: DeckSlot[]): number {
  return slots.reduce((sum, s) => sum + s.count, 0);
}
