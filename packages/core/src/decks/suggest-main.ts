import type { Card } from '../types';
import type { AssistConfig, RulesConfig } from '../rules/rules';
import { isChampionUnit, isChosenChampion, isSignature, matchesSignature, sharesTag, tagIn, type LegendContext } from './identity';

export interface Candidate {
  card: Card;
  /** Copies still available to add (owned, capped by the copy limit, minus copies in the deck). */
  available: number;
  /** Subtracted from the score, for cards that still have to be acquired. */
  penalty?: number;
}

export interface MainPick {
  cardKey: string;
  count: number;
  reason: string;
  /** True on the pick that became the deck chosen champion. */
  chosenChampion: boolean;
}

/** What the deck already holds, so picks complete it rather than restart it. */
export interface MainInput {
  candidates: Candidate[];
  ctx: LegendContext;
  rules: RulesConfig;
  assist: AssistConfig;
  /** Deck size the curve and type shares are scaled to. */
  deckSize: number;
  curve: Record<number, number>;
  types: Record<string, number>;
  /** Champion units already in the main deck. */
  championCards: Card[];
  /** The chosen champion already decided for the deck, if any. */
  chosen?: Card;
  /** Signature cards already in the main deck (and sideboard when the limit spans it). */
  signatureCount: number;
  /** Deck.chosenChampionKey when set: only this card may become the chosen champion. */
  preferredChampionKey?: string;
}

/** Running picture of the deck while copies are chosen one at a time. */
interface MainState {
  curve: Map<number, number>;
  types: Map<string, number>;
  chosenKey: string | undefined;
  otherChampions: Set<string>;
  /** Non champion-tag tags of the chosen champion, such as its faction. */
  sideTags: Set<string>;
  signatureCount: number;
}

interface Reason {
  /** Signed contribution to the score. */
  weight: number;
  text: string;
  /** Worth showing to the user: a clear gap or a bonus, not a marginal term. */
  noteworthy: boolean;
}

interface Scored {
  score: number;
  reasons: Reason[];
}

function bucketOf(energy: number, cap: number): number {
  return Math.min(energy, cap);
}

function bucketLabel(bucket: number, cap: number): string {
  return bucket >= cap ? `${cap}+` : String(bucket);
}

/** Missing share of a target, clamped so one bucket cannot dominate. */
function gapShare(target: number, current: number, limit: number): number {
  const share = (target - current) / Math.max(target, 1);
  return Math.max(-limit, Math.min(limit, share));
}

function lookupShare(table: object, key: string): number {
  return (table as Record<string, number | undefined>)[key] ?? 0;
}

function compare(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function describeReasons(reasons: Reason[], fallback: string, max: number): string {
  const top = reasons
    .filter((r) => r.noteworthy && r.weight > 0)
    .slice(0, max)
    .map((r) => r.text);
  return top.length === 0 ? fallback : top.join('; ');
}

/** Could this card become the deck chosen champion now? Honors an explicit preferred key. */
function canBecomeChosen(card: Card, state: MainState, input: MainInput): boolean {
  if (state.chosenKey !== undefined || !isChosenChampion(card, input.ctx, input.rules)) return false;
  return input.preferredChampionKey === undefined || card.cardKey === input.preferredChampionKey;
}

/** May this candidate still be picked? Enforces the champion line, other champion cap and signature cap. */
function isEligible(c: Candidate, state: MainState, input: MainInput): boolean {
  const { card } = c;
  const { rules, assist, ctx } = input;
  if (isSignature(card, rules) && state.signatureCount >= rules.signatureLimit) return false;
  if (!isChampionUnit(card, rules)) return true;
  if (card.cardKey === state.chosenKey) return true;
  if (canBecomeChosen(card, state, input)) return true;
  return state.otherChampions.has(card.cardKey) || state.otherChampions.size < assist.otherChampionCards;
}

function curveTerm(card: Card, state: MainState, input: MainInput): Reason | undefined {
  if (card.energy === null) return undefined;
  const { assist } = input;
  const bucket = bucketOf(card.energy, assist.curveBucketCap);
  const target = lookupShare(assist.curveTargetShare, String(bucket)) * input.deckSize;
  const have = state.curve.get(bucket) ?? 0;
  const gap = gapShare(target, have, assist.gapShareLimit);
  const label = bucketLabel(bucket, assist.curveBucketCap);
  return {
    weight: assist.weights.curveGap * gap,
    noteworthy: gap >= assist.reasonMinGap,
    text: `Fills the ${label} energy part of the curve (${have} now, about ${Math.round(target)} wanted)`,
  };
}

function typeTerm(card: Card, state: MainState, input: MainInput): Reason {
  const { assist } = input;
  const target = lookupShare(assist.typeTargetShare, card.type) * input.deckSize;
  const have = state.types.get(card.type) ?? 0;
  const gap = gapShare(target, have, assist.gapShareLimit);
  return {
    weight: assist.weights.typeGap * gap,
    noteworthy: gap >= assist.reasonMinGap,
    text: `Deck is light on ${card.type.toLowerCase()}s (${have} now, about ${Math.round(target)} wanted)`,
  };
}

/** Bonus terms: champion line first, then champion tag, signature and faction affinity. */
function affinityTerms(card: Card, state: MainState, input: MainInput): Reason[] {
  const { ctx, rules, assist } = input;
  const w = assist.weights;
  const terms: Reason[] = [];
  const add = (weight: number, text: string, noteworthy = true) => terms.push({ weight, text, noteworthy });
  if (canBecomeChosen(card, state, input)) {
    add(w.chosenChampion, `Chosen champion for ${ctx.legend.name}`);
  } else if (card.cardKey === state.chosenKey) {
    add(w.chosenLine, 'More copies of your chosen champion');
  }
  const signature = isSignature(card, rules) && matchesSignature(card, ctx);
  if (signature) add(w.signature, `Signature card for ${ctx.legend.name}`);
  if (sharesTag(card, ctx.championTags)) {
    // Signature cards always share the tag, so let the signature reason speak for them.
    add(w.championTag, `Shares the ${ctx.championTags.join('/')} champion tag with your legend`, !signature);
  } else if (card.tags.some((t) => state.sideTags.has(t))) {
    add(w.factionTag, 'Shares a faction tag with your chosen champion', false);
  }
  return terms;
}

/** Every term moves the score; only clear gaps and bonuses become the human readable reason. */
function scoreCandidate(c: Candidate, state: MainState, input: MainInput): Scored {
  const gapTerms = [curveTerm(c.card, state, input), typeTerm(c.card, state, input)].flatMap((t) => (t ? [t] : []));
  const bonus = affinityTerms(c.card, state, input);
  const penalty = c.penalty ?? 0;
  const score = [...gapTerms, ...bonus].reduce((sum, t) => sum + t.weight, 0) - penalty;
  // Bonuses read best first, then the biggest gap.
  return { score, reasons: [...bonus, ...[...gapTerms].sort((a, b) => b.weight - a.weight)] };
}

function compareBest(a: { c: Candidate; s: Scored }, b: { c: Candidate; s: Scored }): number {
  return (
    compare(b.s.score, a.s.score) ||
    compare(b.c.available, a.c.available) ||
    compare(a.c.card.energy ?? Infinity, b.c.card.energy ?? Infinity) ||
    a.c.card.cardKey.localeCompare(b.c.card.cardKey)
  );
}

function addSideTags(state: MainState, card: Card, input: MainInput): void {
  for (const t of card.tags) if (!tagIn(t, input.ctx.championTags)) state.sideTags.add(t);
}

function applyPick(state: MainState, card: Card, input: MainInput): void {
  if (card.energy !== null) {
    const bucket = bucketOf(card.energy, input.assist.curveBucketCap);
    state.curve.set(bucket, (state.curve.get(bucket) ?? 0) + 1);
  }
  state.types.set(card.type, (state.types.get(card.type) ?? 0) + 1);
  if (isSignature(card, input.rules)) state.signatureCount += 1;
  if (!isChampionUnit(card, input.rules) || card.cardKey === state.chosenKey) return;
  if (canBecomeChosen(card, state, input)) {
    state.chosenKey = card.cardKey;
    addSideTags(state, card, input);
  } else {
    state.otherChampions.add(card.cardKey);
  }
}

function initialState(input: MainInput): MainState {
  const cap = input.assist.curveBucketCap;
  const curve = new Map<number, number>();
  for (const [energy, count] of Object.entries(input.curve)) {
    const bucket = bucketOf(Number(energy), cap);
    curve.set(bucket, (curve.get(bucket) ?? 0) + count);
  }
  const state: MainState = {
    curve,
    types: new Map(Object.entries(input.types)),
    chosenKey: input.chosen?.cardKey,
    otherChampions: new Set(input.championCards.map((c) => c.cardKey).filter((k) => k !== input.chosen?.cardKey)),
    sideTags: new Set(),
    signatureCount: input.signatureCount,
  };
  if (input.chosen) addSideTags(state, input.chosen, input);
  return state;
}

export interface MainResult {
  picks: MainPick[];
  /** A main slot was held back because no chosen champion exists or can be filled from the candidates. */
  championMissing: boolean;
}

/**
 * Greedy pick of `remaining` copies one at a time, rescoring after each so the curve and
 * types balance out. When the rules require a chosen champion and none is in the deck or
 * available among the candidates, one slot is reserved for it, as buildableLegends does.
 */
export function pickMainCards(input: MainInput, remaining: number): MainResult {
  const state = initialState(input);
  const needsChampion =
    input.rules.includesChosenChampion &&
    input.ctx.resolution.status === 'resolved' &&
    state.chosenKey === undefined &&
    !input.candidates.some((c) => c.available > 0 && canBecomeChosen(c.card, state, input));
  const slots = needsChampion ? Math.max(0, remaining - 1) : remaining;
  const left = new Map(input.candidates.map((c) => [c.card.cardKey, c.available]));
  const picks = new Map<string, MainPick>();
  for (let i = 0; i < slots; i++) {
    const open = input.candidates.filter((c) => (left.get(c.card.cardKey) ?? 0) > 0 && isEligible(c, state, input));
    const best = open.map((c) => ({ c, s: scoreCandidate(c, state, input) })).sort(compareBest)[0];
    if (!best) break;
    const key = best.c.card.cardKey;
    const becomesChosen = canBecomeChosen(best.c.card, state, input);
    left.set(key, (left.get(key) ?? 0) - 1);
    const reason = describeReasons(best.s.reasons, 'Owned legal card that fills an open slot', input.assist.maxReasons);
    applyPick(state, best.c.card, input);
    const existing = picks.get(key);
    picks.set(key, existing
      ? { ...existing, count: existing.count + 1 }
      : { cardKey: key, count: 1, reason, chosenChampion: becomesChosen });
  }
  return { picks: [...picks.values()], championMissing: needsChampion && remaining > 0 };
}
