/** Pure helpers that turn validation issues and fill suggestions into deck edits. */
import { defaultRules, type AcquireSuggestion, type Catalog, type Deck, type DeckIssue, type DeckSection, type FillSuggestion, type RulesConfig } from '@sc/core';
import { SECTION_LABELS, SECTION_ORDER } from './constants';
import { adjustCard, copyLimitOf, countOf, removeCard } from './deckModel';

export { withValidChampion } from './deckModel';

/** Add suggested cards one copy at a time so every copy limit still applies. */
export function applySuggestions(deck: Deck, catalog: Catalog, suggestions: FillSuggestion[], rules: RulesConfig = defaultRules): Deck {
  let next = deck;
  for (const suggestion of suggestions) {
    const card = catalog.cards[suggestion.cardKey];
    if (!card || suggestion.count <= 0) continue;
    for (let i = 0; i < suggestion.count; i++) next = adjustCard(next, catalog, card, suggestion.section, 1, rules);
    if (suggestion.role === 'chosen-champion' && countOf(next, 'main', card.cardKey) > 0) next = { ...next, chosenChampionKey: card.cardKey };
  }
  return next;
}

/** The marker suggestion that says no owned champion fits this legend. */
export function missingChampionMarker(suggestions: FillSuggestion[]): FillSuggestion | undefined {
  return suggestions.find((s) => s.role === 'missing-champion');
}

export function realSuggestions(suggestions: FillSuggestion[]): FillSuggestion[] {
  return suggestions.filter((s) => s.count > 0);
}

export type IssueFix = { label: string } & (
  | { edit: (deck: Deck) => Deck }
  | { goto: DeckSection }
  | { open: 'legend' | 'champion' }
);

function trimTo(deck: Deck, catalog: Catalog, cardKey: string, section: DeckSection, limit: number): Deck {
  const card = catalog.cards[cardKey];
  let next = deck;
  while (card && countOf(next, section, cardKey) > limit) {
    const reduced = adjustCard(next, catalog, card, section, -1);
    if (reduced === next) break;
    next = reduced;
  }
  return next;
}

function removeEverywhere(deck: Deck, cardKey: string): Deck {
  return SECTION_ORDER.reduce((next, section) => removeCard(next, section, cardKey), deck);
}

/** A one click fix for a validation issue, when there is a sensible one. */
export function issueFix(issue: DeckIssue, catalog: Catalog, rules: RulesConfig = defaultRules): IssueFix | undefined {
  const key = issue.cardKey;
  const name = key ? (catalog.cards[key]?.name ?? key) : '';
  switch (issue.code) {
    case 'no-legend':
      return { label: 'Choose a legend', open: 'legend' };
    case 'no-champion':
    case 'champion-unresolved':
      return { label: 'Choose a champion', open: 'champion' };
    case 'main-size':
    case 'signature-limit':
      return { label: `Open ${SECTION_LABELS.main.toLowerCase()}`, goto: 'main' };
    case 'rune-size':
    case 'rune-domain':
      return key ? { label: `Remove ${name}`, edit: (d) => removeCard(d, 'runes', key) } : { label: 'Open runes', goto: 'runes' };
    case 'battlefield-count':
      return { label: 'Open battlefields', goto: 'battlefields' };
    case 'sideboard-size':
      return { label: 'Open sideboard', goto: 'sideboard' };
    case 'copy-limit':
      if (!key) return undefined;
      return {
        label: `Trim ${name}`,
        edit: (d) => {
          const card = catalog.cards[key];
          const limit = card ? copyLimitOf(card, 'main', rules) : rules.copyLimit;
          const side = rules.copyLimitAppliesAcrossSideboard ? countOf(d, 'sideboard', key) : 0;
          const overflow = countOf(d, 'main', key) + side - limit;
          const fromSide = Math.min(overflow, side);
          const trimmed = trimTo(d, catalog, key, 'sideboard', countOf(d, 'sideboard', key) - fromSide);
          return trimTo(trimmed, catalog, key, 'main', countOf(trimmed, 'main', key) - (overflow - fromSide));
        },
      };
    case 'battlefield-duplicate':
      return key ? { label: `Keep one ${name}`, edit: (d) => trimTo(d, catalog, key, 'battlefields', rules.battlefieldCopyLimit) } : undefined;
    case 'domain-identity':
    case 'signature-mismatch':
    case 'section-type':
    case 'unknown-card':
      return key ? { label: `Remove ${name}`, edit: (d) => removeEverywhere(d, key) } : undefined;
    default:
      return undefined;
  }
}

/** Apply buy suggestions as if they were owned, so the plan can be checked against the rules. */
export function applyAcquire(deck: Deck, catalog: Catalog, items: AcquireSuggestion[], rules: RulesConfig = defaultRules): Deck {
  const asFill: FillSuggestion[] = items.flatMap((item) =>
    item.section === 'legend' ? [] : [{ cardKey: item.cardKey, count: item.count, reason: item.reason, section: item.section, role: item.role }],
  );
  return applySuggestions(deck, catalog, asFill, rules);
}

export type NextStep =
  | { kind: 'legend'; title: string; detail: string; action: string }
  | { kind: 'fix'; title: string; detail: string; action: string; fix: IssueFix }
  | { kind: 'fill'; title: string; detail: string; action: string }
  | { kind: 'champion'; title: string; detail: string; action: string }
  | { kind: 'buy'; title: string; detail: string; action: string }
  | { kind: 'done'; title: string; detail: string };

export interface NextStepInput {
  hasLegend: boolean;
  issues: DeckIssue[];
  fillCount: number;
  championMissing: boolean;
  missingCopies: number;
  catalog: Catalog;
  rules?: RulesConfig;
}

/** The single most useful thing to do next, in priority order. */
export function nextStep(input: NextStepInput): NextStep {
  const { issues, catalog } = input;
  if (!input.hasLegend) return { kind: 'legend', title: 'Choose a legend', detail: 'Every deck is built around one legend. It decides which cards are legal.', action: 'Choose a legend' };
  const structural = issues.find((i) => i.severity === 'error' && (i.cardKey || i.code === 'no-champion'));
  const fix = structural ? issueFix(structural, catalog, input.rules) : undefined;
  if (structural && fix && 'edit' in fix) return { kind: 'fix', title: 'Fix a rules problem', detail: structural.message, action: fix.label, fix };
  if (input.championMissing) return { kind: 'champion', title: 'No owned champion fits', detail: 'Pick a champion from all cards or see the cheapest one to buy.', action: 'Browse champions' };
  if (input.fillCount > 0) return { kind: 'fill', title: 'Fill from your collection', detail: `${input.fillCount} owned ${input.fillCount === 1 ? 'card fits' : 'cards fit'} this deck.`, action: 'Fill from my collection' };
  if (input.missingCopies > 0 || issues.some((i) => i.severity === 'error')) return { kind: 'buy', title: 'Finish the deck', detail: 'Your collection cannot complete this deck. See what to buy.', action: 'Show what to buy' };
  return { kind: 'done', title: 'This deck is ready', detail: 'No rule errors and every card is owned.' };
}
