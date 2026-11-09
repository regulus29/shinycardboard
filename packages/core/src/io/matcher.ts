import type { Card, Printing, Variant } from '../types';
import { printingsOfCard, setNumberKey, type CatalogIndex } from './catalogIndex';
import { IO_CONFIG, VARIANT_HINT_PHRASES } from './config';
import { normalizeText, similarity, similarityAtLeast, splitParentheticals } from './text';

/** Everything a source row says about which printing it means. */
export interface PrintingRef {
  printingKey?: string;
  tcgplayerId?: string;
  /** Raw set cells (code or label), tried in order. */
  setValues: string[];
  /** Raw card number cell, such as "042", "OGN-042", "29a" or "042/298". */
  number?: string;
  /** Raw name cells, most specific first. */
  names: string[];
  /** Free text that may mention a variant. */
  hintText: string;
}

export type MatchMethod = 'printing-key' | 'tcgplayer-id' | 'set-number' | 'name-exact' | 'name-fuzzy';

export interface PrintingMatch {
  printing: Printing;
  method: MatchMethod;
  /** Looser than an exact identifier: a fuzzy name or a guess between several printings. */
  fuzzy: boolean;
  note?: string;
}

export interface CardNumber {
  setHint?: string;
  value: number;
  /** Trailing letters or stars, for example the "a" in "29a". */
  suffix: string;
}

const CARD_NUMBER = /^\s*(?:([a-z]{2,5})\s*[-\s]\s*)?0*(\d+)\s*([a-z*]{0,2})\s*(?:\/\s*\w+|-\s*\d+)?\s*$/i;

export function parseCardNumber(raw: string): CardNumber | null {
  const match = CARD_NUMBER.exec(raw);
  if (!match) return null;
  return { setHint: match[1], value: Number(match[2]), suffix: (match[3] ?? '').toLowerCase() };
}

export function resolveSetId(index: CatalogIndex, values: string[]): string | undefined {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized === '') continue;
    const exact = index.setIdByName.get(normalized);
    if (exact) return exact;
    // "Riftbound Origins" should still find "Origins".
    for (const [name, setId] of index.setIdByName) {
      if (name.length >= 4 && (normalized.includes(name) || name.includes(normalized))) return setId;
    }
  }
  return undefined;
}

export function extractVariantHints(text: string): Variant[] {
  const padded = ` ${normalizeText(text)} `;
  return (Object.keys(VARIANT_HINT_PHRASES) as (keyof typeof VARIANT_HINT_PHRASES)[]).filter((variant) =>
    VARIANT_HINT_PHRASES[variant].some((phrase) => padded.includes(` ${phrase} `)),
  );
}

const byKey = (a: Printing, b: Printing): number => (a.printingKey < b.printingKey ? -1 : 1);

/** The trailing letters of the collector number inside a source id such as "unl-029a-219". */
function printingSuffix(printing: Printing): string {
  const segment = printing.riftboundId.split('-')[1] ?? '';
  return segment.replace(/^\d+/, '').toLowerCase();
}

/** Choose one printing from candidates using number suffix and variant hints. */
export function pickPrinting(
  candidates: Printing[],
  hints: Variant[],
  suffix: string,
): { printing: Printing; ambiguous: boolean; defaulted: boolean } | null {
  if (candidates.length === 0) return null;
  const bySuffix = suffix ? candidates.filter((p) => printingSuffix(p) === suffix) : [];
  const pool = bySuffix.length > 0 ? bySuffix : candidates;

  let narrowed: Printing[];
  let ambiguous = false;
  let defaulted = false;
  if (hints.length > 0) {
    const hinted = pool.filter((p) => hints.includes(p.variant));
    ambiguous = hinted.length === 0;
    narrowed = hinted.length > 0 ? hinted : pool;
  } else {
    const standard = pool.filter((p) => p.variant === 'standard');
    narrowed = standard.length > 0 ? standard : pool;
    defaulted = pool.length > 1;
  }
  const sorted = [...narrowed].sort(byKey);
  return { printing: sorted[0]!, ambiguous: ambiguous || sorted.length > 1, defaulted };
}

function candidateMatch(
  candidates: Printing[],
  ref: PrintingRef,
  suffix: string,
  method: MatchMethod,
): PrintingMatch | null {
  const pick = pickPrinting(candidates, extractVariantHints(ref.hintText), suffix);
  if (!pick) return null;
  // Rows that name a printing by id or number should not need a guess, so defaulting is worth a warning.
  const warnOnDefault = method === 'set-number' || method === 'tcgplayer-id';
  const guessed = pick.ambiguous || (warnOnDefault && pick.defaulted);
  const note = guessed
    ? `Several printings share this id or number; chose ${pick.printing.printingKey}. Check the variant`
    : undefined;
  return { printing: pick.printing, method, fuzzy: guessed, note };
}

function byPrintingKey(ref: PrintingRef, index: CatalogIndex): PrintingMatch | null {
  const printing = ref.printingKey ? index.catalog.printings[ref.printingKey] : undefined;
  return printing ? { printing, method: 'printing-key', fuzzy: false } : null;
}

function byTcgplayerId(ref: PrintingRef, index: CatalogIndex): PrintingMatch | null {
  const candidates = ref.tcgplayerId ? index.printingsByTcgplayerId.get(ref.tcgplayerId) : undefined;
  return candidates ? candidateMatch(candidates, ref, '', 'tcgplayer-id') : null;
}

function nameAgrees(ref: PrintingRef, card: Card): boolean {
  if (ref.names.length === 0) return true;
  const cardName = normalizeText(card.name);
  return ref.names.some((name) => {
    const base = normalizeText(splitParentheticals(name).base);
    return similarity(base, cardName) >= IO_CONFIG.nameConflictMinSimilarity;
  });
}

function bySetAndNumber(ref: PrintingRef, index: CatalogIndex): PrintingMatch | null {
  const number = ref.number ? parseCardNumber(ref.number) : null;
  if (!number) return null;
  const setId = resolveSetId(index, [...ref.setValues, ...(number.setHint ? [number.setHint] : [])]);
  if (!setId) return null;
  const candidates = index.printingsBySetNumber.get(setNumberKey(setId, number.value));
  if (!candidates) return null;
  const match = candidateMatch(candidates, ref, number.suffix, 'set-number');
  const card = match ? index.catalog.cards[match.printing.cardKey] : undefined;
  // A listed name that contradicts the number means the number is probably wrong.
  return match && card && nameAgrees(ref, card) ? match : null;
}

/** Name variants to try, most specific first: as written, then without parentheticals. */
function nameForms(ref: PrintingRef): string[] {
  const forms = ref.names.flatMap((name) => [normalizeText(name), normalizeText(splitParentheticals(name).base)]);
  return [...new Set(forms.filter((form) => form !== ''))];
}

function printingsForCards(cards: Card[], index: CatalogIndex, setId: string | undefined): Printing[] {
  const all = cards.flatMap((card) => printingsOfCard(index, card));
  const inSet = setId ? all.filter((p) => p.setId.toLowerCase() === setId.toLowerCase()) : all;
  return inSet.length > 0 ? inSet : all;
}

function matchCards(cards: Card[], ref: PrintingRef, index: CatalogIndex, method: MatchMethod): PrintingMatch | null {
  const number = ref.number ? parseCardNumber(ref.number) : null;
  const setId = resolveSetId(index, [...ref.setValues, ...(number?.setHint ? [number.setHint] : [])]);
  const candidates = printingsForCards(cards, index, setId);
  const match = candidateMatch(candidates, ref, number?.suffix ?? '', method);
  if (!match) return null;
  const wrongSet = setId !== undefined && match.printing.setId.toLowerCase() !== setId.toLowerCase();
  return wrongSet
    ? { ...match, fuzzy: true, note: `No printing in set ${setId}; used ${match.printing.printingKey}` }
    : match;
}

function byExactName(ref: PrintingRef, index: CatalogIndex): PrintingMatch | null {
  for (const form of nameForms(ref)) {
    const cards = index.cardsByName.get(form);
    const match = cards ? matchCards(cards, ref, index, 'name-exact') : null;
    if (match) return match;
  }
  return null;
}

type FuzzyResult = { card: Card; score: number } | null;

/** Per import memory for fuzzy lookups: repeated names are free and distinct lookups are capped. */
export interface FuzzySession {
  cache: Map<string, FuzzyResult>;
  lookups: number;
  /** Set when the lookup cap stopped further fuzzy matching. */
  exhausted: boolean;
}

export const newFuzzySession = (): FuzzySession => ({ cache: new Map(), lookups: 0, exhausted: false });

/** Names whose length could still reach the similarity bar for a name of length `length`. */
function* candidateNames(index: CatalogIndex, length: number): Generator<[string, Card[]]> {
  const min = Math.ceil(length * IO_CONFIG.fuzzyMinSimilarity);
  const max = Math.floor(length / IO_CONFIG.fuzzyMinSimilarity);
  for (let candidateLength = min; candidateLength <= max; candidateLength++) {
    yield* index.namesByLength.get(candidateLength) ?? [];
  }
}

function scanForCard(index: CatalogIndex, normalized: string): FuzzyResult {
  let best: { cards: Card[]; score: number } | null = null;
  for (const [name, cards] of candidateNames(index, normalized.length)) {
    const score = similarityAtLeast(normalized, name, IO_CONFIG.fuzzyMinSimilarity);
    if (score === null) continue;
    if (!best || score > best.score) best = { cards: [...cards], score };
    else if (score === best.score) best.cards.push(...cards);
  }
  // Two different cards equally close means a guess, so report no match.
  return best && best.cards.length === 1 ? { card: best.cards[0]!, score: best.score } : null;
}

/**
 * Best card for a normalized name when exactly one card clears the similarity bar.
 * Results are cached in the session, and at most `maxFuzzyLookups` distinct names are searched.
 */
export function fuzzyFindCard(
  index: CatalogIndex,
  normalized: string,
  session: FuzzySession = newFuzzySession(),
): FuzzyResult {
  if (session.cache.has(normalized)) return session.cache.get(normalized)!;
  if (session.lookups >= IO_CONFIG.maxFuzzyLookups) {
    session.exhausted = true;
    return null;
  }
  session.lookups++;
  const found = scanForCard(index, normalized);
  session.cache.set(normalized, found);
  return found;
}

function byFuzzyName(ref: PrintingRef, index: CatalogIndex, session: FuzzySession): PrintingMatch | null {
  for (const form of nameForms(ref)) {
    const found = fuzzyFindCard(index, form, session);
    const match = found ? matchCards([found.card], ref, index, 'name-fuzzy') : null;
    if (match) {
      const note = `Fuzzy name match to "${found!.card.name}"`;
      return { ...match, fuzzy: true, note: match.note ? `${note}; ${match.note}` : note };
    }
  }
  return null;
}

const MATCH_ORDER = [byPrintingKey, byTcgplayerId, bySetAndNumber, byExactName, byFuzzyName] as const;

/** Match order: printing key, TCGplayer id, set plus number, exact name, fuzzy name. */
export function matchPrinting(
  ref: PrintingRef,
  index: CatalogIndex,
  session: FuzzySession = newFuzzySession(),
): PrintingMatch | null {
  for (const step of MATCH_ORDER) {
    const match = step(ref, index, session);
    if (match) return match;
  }
  return null;
}
