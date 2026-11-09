import type { Catalog, Deck } from '../types';
import { defaultRules, type RulesConfig } from '../rules/rules';
import { isChampionUnit, isChosenChampion, legendContext } from './identity';
import { mergeSlots } from './slots';

/** Returns a number in [0, 1). Pass a seeded one for repeatable draws. */
export type RandomSource = () => number;

const UINT32_RANGE = 4294967296;

/** Small fast seedable generator (mulberry32). Same seed, same sequence. */
export function seededRng(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** A sampled opening state, as cardKeys. `library[0]` is the top of the deck. */
export interface SampleHand {
  hand: string[];
  library: string[];
  /** Chosen champion set aside before the draw, when the rules start it outside the library. */
  champion?: string;
}

function shuffle<T>(items: T[], rng: RandomSource): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/** One cardKey per physical copy in the main deck, in slot order. */
function expandMain(deck: Deck): string[] {
  return [...mergeSlots(deck.main ?? [])].flatMap(([key, n]) => Array<string>(n).fill(key));
}

/**
 * The champion whose copy starts outside the library: Deck.chosenChampionKey when it is a
 * champion in the main deck, otherwise the first matching champion in slot order.
 */
function findChampion(deck: Deck, catalog: Catalog, rules: RulesConfig): string | undefined {
  if (!rules.championStartsOutsideLibrary) return undefined;
  const main = mergeSlots(deck.main ?? []);
  const chosen = deck.chosenChampionKey ? catalog.cards[deck.chosenChampionKey] : undefined;
  if (chosen && main.has(chosen.cardKey) && isChampionUnit(chosen, rules)) return chosen.cardKey;
  const legend = deck.legendKey ? catalog.cards[deck.legendKey] : undefined;
  if (!legend) return undefined;
  const ctx = legendContext(legend, catalog, rules, chosen);
  return [...main.keys()].find((key) => {
    const card = catalog.cards[key];
    return card !== undefined && isChosenChampion(card, ctx, rules);
  });
}

/** Shuffle the main deck and draw an opening hand. Hand size defaults to the rules value. */
export function drawHand(
  deck: Deck,
  catalog: Catalog,
  handSize: number = defaultRules.openingHandSize,
  rng: RandomSource = Math.random,
  rules: RulesConfig = defaultRules,
): SampleHand {
  const cards = expandMain(deck);
  const champion = findChampion(deck, catalog, rules);
  const at = champion === undefined ? -1 : cards.indexOf(champion);
  if (at >= 0) cards.splice(at, 1);
  const library = shuffle(cards, rng);
  const hand = library.splice(0, Math.max(0, Math.floor(handSize)));
  return champion === undefined ? { hand, library } : { hand, library, champion };
}

/**
 * Mulligan: the cards at `replaceIndexes` go to the bottom of the library and are replaced
 * from the top, in index order. At most `mulliganMax` distinct valid indexes are honored.
 * Pure: returns a new state and never reshuffles.
 */
export function mulligan(
  state: SampleHand,
  replaceIndexes: number[],
  rules: RulesConfig = defaultRules,
): SampleHand {
  const valid = [...new Set(replaceIndexes)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < state.hand.length)
    .sort((a, b) => a - b)
    .slice(0, rules.mulliganMax);
  const hand = [...state.hand];
  const library = [...state.library];
  const sentDown: string[] = [];
  for (const i of valid) {
    const next = library.shift();
    if (next === undefined) break;
    sentDown.push(hand[i] as string);
    hand[i] = next;
  }
  return { ...state, hand, library: [...library, ...sentDown] };
}
