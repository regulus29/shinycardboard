import { comparePrintings } from '../catalog/order';
import type { Card, Catalog, Printing } from '../types';
import { parseSourceIdRef, parseSourceIdTotal, type NumberRef } from './cardref';
import { STATIC_PHRASES } from './fields';
import { foldRules, foldText, tokenize } from './fold';
import { buildSetPhrases, buildVariantLabelPhrases } from './phrases';
import type { PhraseTarget } from './types';

/** Search-ready facts about a card concept, computed once per catalog. */
export interface CardInfo {
  card: Card;
  nameFolded: string;
  /** Folded name without spaces, so "leesin" finds "Lee Sin". */
  nameCompact: string;
  nameTokens: string[];
  rulesFolded: string;
  /** Rules text wrapped in spaces so whole words can be found with a plain substring test. */
  rulesPadded: string;
  typeFolded: string;
  supertypeFolded: string;
  domainsFolded: string[];
  keywordsFolded: string[];
  tagsFolded: string[];
  tagTokens: string[];
}

/** One searchable printing. */
export interface Entry {
  printing: Printing;
  card: Card;
  info: CardInfo;
  /** Position in the default order (set, number, variant). Used for stable tie-breaks. */
  order: number;
  setId: string;
  setLabelTokens: string[];
  /** Printed set size parsed from the source id (the 298 in "ogn-042-298"). */
  total: number | null;
  /** Folded variant name plus its label (for example "alternate art", "starter"). */
  variantNames: string[];
  artistFolded: string;
  /** Every way the printing can be addressed by number, from collector number and source id. */
  refs: NumberRef[];
}

/** A name as the omnibox offers it: "Vi", "Viktor", "Bewitching Spirit". */
export interface NameHead {
  text: string;
  folded: string;
  /** How many cards carry this head, used to rank suggestions. */
  count: number;
}

export interface SearchIndex {
  entries: Entry[];
  /** Distinct folded name, tag and rules words, used to decide whether typo tolerance is needed. */
  vocabulary: string[];
  vocabularySet: Set<string>;
  /** Lower case set codes present in the catalog. */
  setIds: string[];
  /** Bare phrases: built in facets plus set titles and variant labels from this catalog. */
  phrases: Map<string, PhraseTarget>;
  /** Card name heads ordered by popularity, for suggestions. */
  nameHeads: NameHead[];
  /** Full card names, for multi-word name completion. */
  names: NameHead[];
  /** Distinct artist names, sorted. */
  artists: string[];
  /** Lower case printing keys and source ids to the printing keys they name. */
  printingLookup: Map<string, string[]>;
  /** Standard collector numbers per lower case set code, ascending, for `ogn 4` suggestions. */
  numbersBySet: Map<string, number[]>;
  /** Folded set title words and codes that point at exactly one set, for suggestions. */
  setAliasCodes: Map<string, string>;
}

function buildCardInfo(card: Card): CardInfo {
  const tagsFolded = card.tags.map(foldText);
  const nameFolded = foldText(card.name);
  const rulesFolded = foldRules(card.rulesText);
  return {
    card,
    nameFolded,
    nameCompact: nameFolded.replace(/ /g, ''),
    nameTokens: tokenize(card.name),
    rulesFolded,
    rulesPadded: ` ${rulesFolded} `,
    typeFolded: foldText(card.type),
    supertypeFolded: foldText(card.supertype ?? ''),
    domainsFolded: card.domains.map(foldText),
    keywordsFolded: card.keywords.map(foldText),
    tagsFolded,
    tagTokens: tagsFolded.flatMap((tag) => tag.split(' ')),
  };
}

function buildRefs(printing: Printing): NumberRef[] {
  const source = parseSourceIdRef(printing.riftboundId);
  const refs: NumberRef[] = [
    { prefix: '', number: printing.collectorNumber, suffix: source?.suffix ?? '', total: source?.total ?? null },
  ];
  if (source) refs.push(source);
  return refs;
}

function buildEntry(printing: Printing, info: CardInfo): Entry {
  return {
    printing,
    card: info.card,
    info,
    order: 0,
    setId: printing.setId.toLowerCase(),
    setLabelTokens: tokenize(printing.setLabel),
    total: parseSourceIdTotal(printing.riftboundId),
    variantNames: [foldText(printing.variant), foldText(printing.variantLabel ?? '')].filter(Boolean),
    artistFolded: foldText(printing.artist ?? ''),
    refs: buildRefs(printing),
  };
}

const HEAD_SEPARATORS = [' - ', ', '];

/** "Vi - Destructive" gives "Vi"; "Shen, Scourge of Shadows" gives "Shen"; plain names stay whole. */
function nameHead(name: string): string {
  for (const separator of HEAD_SEPARATORS) {
    const index = name.indexOf(separator);
    if (index > 0) return name.slice(0, index);
  }
  return name;
}

function buildNameHeads(cards: Card[]): NameHead[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const head = nameHead(card.name);
    counts.set(head, (counts.get(head) ?? 0) + 1);
  }
  return [...counts]
    .map(([text, count]) => ({ text, folded: foldText(text), count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

function buildNames(cards: Card[]): NameHead[] {
  return cards
    .map((card) => ({ text: card.name, folded: foldText(card.name), count: card.printingKeys.length }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

/** Source ids spell the marker `*`; lookups use `x` like printing keys. */
function lookupKey(id: string): string {
  return id.toLowerCase().replace(/\*/g, 'x');
}

function buildPrintingLookup(entries: Entry[]): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  const add = (key: string, printingKey: string) => lookup.set(key, [...(lookup.get(key) ?? []), printingKey]);
  for (const { printing } of entries) {
    add(lookupKey(printing.printingKey), printing.printingKey);
    add(lookupKey(printing.riftboundId), printing.printingKey);
  }
  return lookup;
}

function buildArtists(entries: Entry[]): string[] {
  const artists = entries.map((entry) => entry.printing.artist).filter((artist): artist is string => !!artist);
  return [...new Set(artists)].sort((a, b) => a.localeCompare(b));
}

function buildNumbersBySet(entries: Entry[]): Map<string, number[]> {
  const sets = new Map<string, Set<number>>();
  for (const entry of entries) {
    if (entry.printing.variant !== 'standard') continue;
    const numbers = sets.get(entry.setId) ?? new Set<number>();
    numbers.add(entry.printing.collectorNumber);
    sets.set(entry.setId, numbers);
  }
  return new Map([...sets].map(([setId, numbers]) => [setId, [...numbers].sort((a, b) => a - b)]));
}

/** Aliases that name a single set; ambiguous ones (promo) cannot be completed to one code. */
function buildSetAliasCodes(phrases: Map<string, PhraseTarget>): Map<string, string> {
  const codes = new Map<string, string>();
  for (const [phrase, target] of phrases) {
    const facet = target.kind === 'facets' && target.isSet ? target.facets[0] : undefined;
    if (facet && facet.values.length === 1) codes.set(phrase, facet.values[0] as string);
  }
  return codes;
}

function buildIndex(catalog: Catalog): SearchIndex {
  const infoByCard = new Map<string, CardInfo>();
  const entries: Entry[] = [];
  for (const printing of Object.values(catalog.printings)) {
    const card = catalog.cards[printing.cardKey];
    if (!card) continue;
    let info = infoByCard.get(card.cardKey);
    if (!info) {
      info = buildCardInfo(card);
      infoByCard.set(card.cardKey, info);
    }
    entries.push(buildEntry(printing, info));
  }
  entries.sort((a, b) => comparePrintings(a.printing, b.printing));
  entries.forEach((entry, order) => {
    entry.order = order;
  });
  const words = new Set<string>();
  for (const info of infoByCard.values()) {
    for (const word of [...info.nameTokens, ...info.tagTokens, ...info.rulesFolded.split(' ')]) {
      if (word) words.add(word);
    }
  }
  const phrases = new Map<string, PhraseTarget>([
    ...STATIC_PHRASES,
    ...buildVariantLabelPhrases(catalog),
    ...buildSetPhrases(catalog.sets),
  ]);
  return {
    entries,
    vocabulary: [...words],
    vocabularySet: words,
    setIds: [...new Set(entries.map((entry) => entry.setId))],
    phrases,
    nameHeads: buildNameHeads([...infoByCard.values()].map((info) => info.card)),
    names: buildNames([...infoByCard.values()].map((info) => info.card)),
    artists: buildArtists(entries),
    printingLookup: buildPrintingLookup(entries),
    numbersBySet: buildNumbersBySet(entries),
    setAliasCodes: buildSetAliasCodes(phrases),
  };
}

const cache = new WeakMap<Catalog, SearchIndex>();

/**
 * Index for a catalog, built once and cached by object identity. Catalogs are treated as
 * immutable; build a new catalog object after a data refresh.
 */
export function getIndex(catalog: Catalog): SearchIndex {
  let index = cache.get(catalog);
  if (!index) {
    index = buildIndex(catalog);
    cache.set(catalog, index);
  }
  return index;
}
