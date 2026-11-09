import type { Catalog, Deck } from '../types';
import { defaultRules, type RulesConfig } from '../rules/rules';
import type { DeckCompletion, DeckSection, SectionStatus } from './deck-types';
import { mergeSlots, sumCounts } from './slots';
import { sizeOk, validateDeck } from './validate';

function countOf(deck: Deck, section: DeckSection): number {
  return sumCounts(mergeSlots(deck[section] ?? []));
}

/** Smallest allowed sideboard size that fits the count, otherwise the largest allowed. */
function sideboardTarget(count: number, sizes: number[]): number {
  const sorted = [...sizes].sort((a, b) => a - b);
  return sorted.find((s) => s >= count) ?? sorted[sorted.length - 1] ?? 0;
}

function status(section: SectionStatus['section'], count: number, target: number, complete: boolean): SectionStatus {
  return { section, count, target, remaining: Math.max(0, target - count), complete };
}

/** How complete each section is, for progress bars and "3 more cards" hints. */
export function deckCompletion(deck: Deck, catalog: Catalog, rules: RulesConfig = defaultRules): DeckCompletion {
  const legendCount = deck.legendKey && catalog.cards[deck.legendKey] ? 1 : 0;
  const main = countOf(deck, 'main');
  const runes = countOf(deck, 'runes');
  const battlefields = countOf(deck, 'battlefields');
  const side = countOf(deck, 'sideboard');
  const required: SectionStatus[] = [
    status('legend', legendCount, rules.legendCount, legendCount >= rules.legendCount),
    status('main', main, rules.mainDeckSize, sizeOk(main, rules.mainDeckSize, rules.mainDeckSizeIsMinimum)),
    status('runes', runes, rules.runeDeckSize, runes === rules.runeDeckSize),
    status('battlefields', battlefields, rules.battlefieldCount, battlefields === rules.battlefieldCount),
  ];
  const sideboard = status('sideboard', side, sideboardTarget(side, rules.sideboardSizes), rules.sideboardSizes.includes(side));
  const target = required.reduce((sum, s) => sum + s.target, 0);
  const filled = required.reduce((sum, s) => sum + Math.min(s.count, s.target), 0);
  const noErrors = validateDeck(deck, catalog, rules).every((i) => i.severity !== 'error');
  return {
    sections: [...required, sideboard],
    percent: target === 0 ? 0 : filled / target,
    ready: noErrors && required.every((s) => s.complete),
  };
}
