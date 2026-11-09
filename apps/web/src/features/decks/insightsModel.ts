/** Pure helpers for the insights pane: curve data, issue grouping, text exports and rule provenance. */
import {
  defaultRules,
  type AcquireSuggestion,
  type Catalog,
  type ConflictEntry,
  type Deck,
  type DeckIssue,
  type DeckStats,
  type FillSuggestion,
  type MissingEntry,
  type RulesConfig,
} from '@sc/core';
import { ENERGY_BUCKET_MAX, RULE_LABELS } from './constants';

export interface CurveBar {
  energy: number;
  label: string;
  count: number;
}

/** Energy curve bars from 0 to the cap; the last bar collects everything at or above it. */
export function curveBars(stats: DeckStats, cap: number = ENERGY_BUCKET_MAX): CurveBar[] {
  const bars: CurveBar[] = Array.from({ length: cap + 1 }, (_, energy) => ({
    energy,
    label: energy === cap ? `${cap}+` : String(energy),
    count: 0,
  }));
  for (const [energy, count] of Object.entries(stats.curve)) {
    const at = Math.min(Math.max(0, Number(energy)), cap);
    const bar = bars[at];
    if (bar) bar.count += count;
  }
  return bars;
}

/** A sentence for screen readers that carries the same information as the chart. */
export function curveSummary(bars: CurveBar[], average: number): string {
  const parts = bars.filter((bar) => bar.count > 0).map((bar) => `${bar.count} at energy ${bar.label}`);
  if (parts.length === 0) return 'No main deck cards with an energy cost yet.';
  return `Energy curve: ${parts.join(', ')}. Average energy ${average.toFixed(1)}.`;
}

export interface IssueGroups {
  errors: DeckIssue[];
  warnings: DeckIssue[];
}

export function groupIssues(issues: DeckIssue[]): IssueGroups {
  return { errors: issues.filter((i) => i.severity === 'error'), warnings: issues.filter((i) => i.severity === 'warning') };
}

export type ValidityTone = 'success' | 'warning' | 'danger';

export function validity(issues: DeckIssue[]): { tone: ValidityTone; label: string } {
  const { errors, warnings } = groupIssues(issues);
  if (errors.length) return { tone: 'danger', label: errors.length === 1 ? '1 error' : `${errors.length} errors` };
  if (warnings.length) return { tone: 'warning', label: warnings.length === 1 ? '1 warning' : `${warnings.length} warnings` };
  return { tone: 'success', label: 'Legal' };
}

function nameOf(catalog: Catalog, cardKey: string): string {
  return catalog.cards[cardKey]?.name ?? cardKey;
}

/** Cards in the deck that the catalog no longer knows (retired keys). They can never be bought. */
export function retiredKeys(deck: Deck, catalog: Catalog): string[] {
  const keys = [...deck.main, ...deck.runes, ...deck.battlefields, ...deck.sideboard].map((slot) => slot.cardKey);
  return [...new Set(keys.filter((key) => !catalog.cards[key]))];
}

/** Missing entries for cards the catalog knows; retired keys are reported separately. */
export function buyableMissing(missing: MissingEntry[], catalog: Catalog): MissingEntry[] {
  return missing.filter((entry) => catalog.cards[entry.cardKey] !== undefined);
}

/** Copies short because other decks claim them (demand above owned), summed over conflicts. */
export function sharedCopies(conflicts: ConflictEntry[]): number {
  return conflicts.reduce((sum, c) => sum + Math.max(0, c.demanded - c.owned), 0);
}

/** "2 Card Name" lines for the cards still missing from the collection. */
export function shoppingList(missing: MissingEntry[], catalog: Catalog): string {
  return missing.map((entry) => `${entry.missing} ${nameOf(catalog, entry.cardKey)}`).join('\n');
}

export function acquireList(items: AcquireSuggestion[], catalog: Catalog): string {
  return items.filter((item) => item.count > 0).map((item) => `${item.count} ${nameOf(catalog, item.cardKey)}`).join('\n');
}

export function fillTotal(items: FillSuggestion[]): number {
  return items.reduce((sum, item) => sum + item.count, 0);
}

export type ProvenanceStatus = 'confirmed' | 'attested' | 'unverified';

export interface ProvenanceEntry {
  key: string;
  label: string;
  status: ProvenanceStatus;
  source: string;
}

const STATUS_RANK: Record<ProvenanceStatus, number> = { unverified: 0, attested: 1, confirmed: 2 };

/** Rule provenance from rules.config.json, least certain first so doubts are seen first. */
export function provenanceEntries(rules: RulesConfig = defaultRules): ProvenanceEntry[] {
  const table: Record<string, { status: string; source: string }> = rules.provenance;
  return Object.entries(table)
    .map(([key, value]) => ({
      key,
      label: RULE_LABELS[key] ?? key,
      status: (value.status in STATUS_RANK ? value.status : 'unverified') as ProvenanceStatus,
      source: value.source,
    }))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.label.localeCompare(b.label));
}

/** Percent 0..100 for display, rounded. */
export function percent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}
