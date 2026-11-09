import type { Card, Catalog, Deck, DeckSlot, OwnedEntry } from '../types';
import { defaultAssist, defaultRules, type AssistConfig, type RulesConfig } from '../rules/rules';
import type { AcquireSuggestion, DeckSection, FillSuggestion } from './deck-types';
import {
  cardSection,
  copyLimitFor,
  isChampionUnit,
  isChosenChampion,
  isLegalFor,
  isSignature,
  legendContext,
  type LegendContext,
} from './identity';
import { ownedByCard, ownedCards, type OwnedCard } from './ownership';
import { mergeSlots, sumCounts } from './slots';
import { deckStats } from './stats';
import { pickMainCards, type Candidate, type MainPick, type MainResult } from './suggest-main';
import { suggestBattlefields, suggestRunes } from './suggest-support';

/** The deck as the assist tools see it: legend context plus what main already holds. */
interface DeckView {
  ctx: LegendContext;
  main: Map<string, number>;
  runes: Map<string, number>;
  battlefields: Map<string, number>;
  /** Copies of each card in main plus (when the limit spans it) the sideboard. */
  used: Map<string, number>;
  chosen: Card | undefined;
  championCards: Card[];
  signatureCount: number;
  /** Deck.chosenChampionKey when it names a champion unit: only that card may become the chosen champion. */
  preferred: string | undefined;
}

function copiesInUse(deck: Deck, main: Map<string, number>, rules: RulesConfig): Map<string, number> {
  const used = new Map(main);
  if (!rules.copyLimitAppliesAcrossSideboard) return used;
  for (const [key, n] of mergeSlots(deck.sideboard ?? [])) used.set(key, (used.get(key) ?? 0) + n);
  return used;
}

/**
 * The chosen champion already in the deck: the explicit key when it is in main (never inferred
 * around an explicit key that is not), else the first matching champion in main.
 */
function currentChosen(deck: Deck, catalog: Catalog, main: Map<string, number>, ctx: LegendContext, rules: RulesConfig): Card | undefined {
  const explicit = deck.chosenChampionKey ? catalog.cards[deck.chosenChampionKey] : undefined;
  if (explicit && isChampionUnit(explicit, rules)) return main.has(explicit.cardKey) ? explicit : undefined;
  const keys = [...main.keys()];
  return keys.map((k) => catalog.cards[k]).find((c): c is Card => c !== undefined && isChosenChampion(c, ctx, rules));
}

/** Signature copies in main, plus the sideboard when the limit spans it. */
function signatureCopies(deck: Deck, catalog: Catalog, rules: RulesConfig): number {
  const slots = rules.signatureLimitAppliesAcrossSideboard ? [...(deck.main ?? []), ...(deck.sideboard ?? [])] : (deck.main ?? []);
  let total = 0;
  for (const [key, n] of mergeSlots(slots)) {
    const card = catalog.cards[key];
    if (card && isSignature(card, rules)) total += n;
  }
  return total;
}

function viewDeck(deck: Deck, catalog: Catalog, rules: RulesConfig): DeckView | undefined {
  const legend = deck.legendKey ? catalog.cards[deck.legendKey] : undefined;
  if (!legend) return undefined;
  const explicit = deck.chosenChampionKey ? catalog.cards[deck.chosenChampionKey] : undefined;
  const ctx = legendContext(legend, catalog, rules, explicit);
  const main = mergeSlots(deck.main ?? []);
  const mainCards = [...main.keys()].flatMap((k) => (catalog.cards[k] ? [catalog.cards[k] as Card] : []));
  return {
    ctx,
    main,
    runes: mergeSlots(deck.runes ?? []),
    battlefields: mergeSlots(deck.battlefields ?? []),
    used: copiesInUse(deck, main, rules),
    chosen: currentChosen(deck, catalog, main, ctx, rules),
    championCards: mainCards.filter((c) => isChampionUnit(c, rules)),
    signatureCount: signatureCopies(deck, catalog, rules),
    preferred: explicit && isChampionUnit(explicit, rules) ? explicit.cardKey : undefined,
  };
}

function toCandidates(pool: OwnedCard[], used: Map<string, number>, rules: RulesConfig): Candidate[] {
  return pool
    .map(({ card, owned }) => ({ card, available: Math.min(owned, copyLimitFor(card, rules)) - (used.get(card.cardKey) ?? 0) }))
    .filter((c) => c.available > 0);
}

function mainSuggestions(view: DeckView, deck: Deck, catalog: Catalog, candidates: Candidate[], rules: RulesConfig, assist: AssistConfig): MainResult {
  const stats = deckStats(deck, catalog);
  const input = {
    candidates, ctx: view.ctx, rules, assist, deckSize: rules.mainDeckSize,
    curve: stats.curve, types: stats.byType, championCards: view.championCards,
    ...(view.chosen ? { chosen: view.chosen } : {}), signatureCount: view.signatureCount,
    ...(view.preferred ? { preferredChampionKey: view.preferred } : {}),
  };
  return pickMainCards(input, Math.max(0, rules.mainDeckSize - sumCounts(view.main)));
}

function asFill(pick: MainPick): FillSuggestion {
  const base: FillSuggestion = { cardKey: pick.cardKey, count: pick.count, reason: pick.reason, section: 'main' };
  return pick.chosenChampion ? { ...base, role: 'chosen-champion' } : base;
}

/** Count 0 marker telling the UI a main slot is held for a champion the collection lacks. */
function missingChampionMarker(view: DeckView): FillSuggestion {
  const name = view.ctx.legend.name;
  return {
    cardKey: view.ctx.legend.cardKey,
    count: 0,
    section: 'main',
    role: 'missing-champion',
    reason: `No owned champion fits ${name}, so one main slot is held back for a chosen champion`,
  };
}

/**
 * Suggest owned cards that complete a partial deck. Only legal cards are offered. Copy
 * limits, the signature limit and copies already in the deck are respected. The result
 * is a coherent deck: the chosen champion line (set via Deck.chosenChampionKey or picked
 * first), at most `otherChampionCards` further champions, cards that share the champion
 * tag ahead of faction tags, and a curve and type split near the assist targets. Each
 * suggestion carries its section and a plain reason.
 * Order: main deck cards (chosen champion first), then runes, then battlefields.
 * Availability considers this deck only; copies committed to other decks are not subtracted.
 */
export function suggestFill(
  deck: Deck,
  owned: OwnedEntry[],
  catalog: Catalog,
  rules: RulesConfig = defaultRules,
  assist: AssistConfig = defaultAssist,
): FillSuggestion[] {
  const view = viewDeck(deck, catalog, rules);
  if (!view) return [];
  const pool = ownedCards(owned, catalog).filter(({ card }) => isLegalFor(card, view.ctx, rules));
  const bySection = (name: 'main' | 'runes' | 'battlefields') => pool.filter(({ card }) => cardSection(card, rules) === name);
  const runeOptions = bySection('runes').map(({ card, owned: n }) => ({ card, available: n - (view.runes.get(card.cardKey) ?? 0) }));
  const bfOptions = toCandidates(bySection('battlefields'), view.battlefields, rules);
  const main = mainSuggestions(view, deck, catalog, toCandidates(bySection('main'), view.used, rules), rules, assist);
  const marker: FillSuggestion[] = main.championMissing ? [missingChampionMarker(view)] : [];
  return [
    ...main.picks.map(asFill),
    ...marker,
    ...suggestRunes(runeOptions, view.runes, Math.max(0, rules.runeDeckSize - sumCounts(view.runes)), view.ctx),
    ...suggestBattlefields(bfOptions, Math.max(0, rules.battlefieldCount - sumCounts(view.battlefields))),
  ];
}

/** Append suggestions to a copy of the deck, so a second pass sees them as already chosen. */
function withSuggestions(deck: Deck, picks: FillSuggestion[]): Deck {
  const slots = (section: DeckSection): DeckSlot[] =>
    picks.filter((p) => p.section === section).map((p) => ({ cardKey: p.cardKey, count: p.count }));
  const chosen = picks.find((p) => p.role === 'chosen-champion');
  return {
    ...deck,
    ...(chosen ? { chosenChampionKey: chosen.cardKey } : {}),
    main: [...(deck.main ?? []), ...slots('main')],
    runes: [...(deck.runes ?? []), ...slots('runes')],
    battlefields: [...(deck.battlefields ?? []), ...slots('battlefields')],
  };
}

/** Rarity of the cheapest standard printing, as a relative cost. No prices are involved. */
function acquireCost(card: Card, catalog: Catalog, assist: AssistConfig): { rarity: string; cost: number } {
  const costs = (assist.rarityCost as Record<string, number | undefined>);
  const options = card.printingKeys.flatMap((k) => (catalog.printings[k] ? [catalog.printings[k]] : []));
  const ranked = options
    .map((p) => ({ rarity: p.rarity, cost: costs[p.rarity] ?? assist.unknownRarityCost }))
    .sort((a, b) => a.cost - b.cost);
  return ranked[0] ?? { rarity: 'Unknown', cost: assist.unknownRarityCost };
}

function toAcquire(s: FillSuggestion, catalog: Catalog, assist: AssistConfig): AcquireSuggestion {
  const card = catalog.cards[s.cardKey];
  const rarity = card ? acquireCost(card, catalog, assist).rarity : 'Unknown';
  const base: AcquireSuggestion = { cardKey: s.cardKey, count: s.count, section: s.section, reason: `${rarity} rarity. ${s.reason}` };
  return s.role === 'chosen-champion' ? { ...base, role: 'chosen-champion' } : base;
}

/**
 * What to buy to complete a legal deck when the owned pool cannot: the owned fill first, then
 * the best fitting cards that are cheapest by rarity (no prices), then runes, battlefields and
 * the legend itself. Returns an empty list when the owned cards already complete the deck.
 */
export function suggestMissing(
  deck: Deck,
  owned: OwnedEntry[],
  catalog: Catalog,
  rules: RulesConfig = defaultRules,
  assist: AssistConfig = defaultAssist,
): AcquireSuggestion[] {
  const first = suggestFill(deck, owned, catalog, rules, assist).filter((s) => s.count > 0);
  const planned = withSuggestions(deck, first);
  const view = viewDeck(planned, catalog, rules);
  if (!view || !deck.legendKey) return [];
  const legal = Object.values(catalog.cards).filter((card) => isLegalFor(card, view.ctx, rules));
  const section = (name: 'main' | 'runes' | 'battlefields') => legal.filter((card) => cardSection(card, rules) === name);
  const penalty = (card: Card) => acquireCost(card, catalog, assist).cost * assist.weights.acquirePenalty;
  const mainCandidates: Candidate[] = section('main')
    .map((card) => ({ card, available: copyLimitFor(card, rules) - (view.used.get(card.cardKey) ?? 0), penalty: penalty(card) }))
    .filter((c) => c.available > 0);
  const runeOptions = section('runes').map((card) => ({ card, available: Number.MAX_SAFE_INTEGER }));
  const bfOptions = section('battlefields')
    .map((card) => ({ card, available: copyLimitFor(card, rules) - (view.battlefields.get(card.cardKey) ?? 0) }))
    .filter((o) => o.available > 0);
  const buys: FillSuggestion[] = [
    ...mainSuggestions(view, planned, catalog, mainCandidates, rules, assist).picks.map(asFill),
    ...suggestRunes(runeOptions, view.runes, Math.max(0, rules.runeDeckSize - sumCounts(view.runes)), view.ctx),
    ...suggestBattlefields(bfOptions, Math.max(0, rules.battlefieldCount - sumCounts(view.battlefields)), (c) => acquireCost(c, catalog, assist).cost),
  ];
  const legendOwned = (ownedByCard(owned, catalog)[deck.legendKey] ?? 0) >= rules.legendCount;
  const legend: AcquireSuggestion[] = legendOwned
    ? []
    : [{ cardKey: deck.legendKey, count: rules.legendCount, section: 'legend', reason: `${view.ctx.legend.name} is the Legend this deck is built around` }];
  return [...legend, ...buys.map((s) => toAcquire(s, catalog, assist))];
}
