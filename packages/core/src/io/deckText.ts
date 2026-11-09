import type { Card, CardType, Catalog, Deck, DeckSlot } from '../types';
import { getCatalogIndex, type CatalogIndex } from './catalogIndex';
import {
  DECK_COMMENT_PREFIXES,
  DECK_HEADING_ALIASES,
  DECK_NAME_KEYS,
  DECK_SECTION_TITLES,
  IO_CONFIG,
  type DeckSection,
} from './config';
import { newRecordId } from './entries';
import { fuzzyFindCard, newFuzzySession, type FuzzySession } from './matcher';
import { normalizeText, splitParentheticals } from './text';

/** Sections in the order they are written. */
const SECTION_ORDER: readonly DeckSection[] = ['legend', 'champion', 'main', 'runes', 'battlefields', 'sideboard'];

type SlotSection = 'main' | 'runes' | 'battlefields' | 'sideboard';

/** What a dedicated section accepts. Cards that do not qualify are reported, not placed. */
const SECTION_RULES: Partial<Record<DeckSection, { accepts: (card: Card) => boolean; rejection: string }>> = {
  legend: { accepts: (card) => card.type === 'Legend', rejection: 'not a Legend' },
  champion: { accepts: (card) => card.type === 'Unit' && card.supertype === 'Champion', rejection: 'not a Champion unit' },
};

/** Card type a section prefers when several cards share a name. */
const SECTION_PREFERRED_TYPE: Partial<Record<DeckSection, CardType>> = {
  runes: 'Rune',
  battlefields: 'Battlefield',
};

/** Card types that always belong to a dedicated section when listed in the main area. */
const TYPE_HOME_SECTION: Partial<Record<CardType, DeckSection>> = {
  Legend: 'legend',
  Rune: 'runes',
  Battlefield: 'battlefields',
};

const nameOf = (catalog: Catalog, cardKey: string): string => catalog.cards[cardKey]?.name ?? cardKey;

function slotLines(slots: DeckSlot[], catalog: Catalog): string[] {
  return slots.map((slot) => `${slot.count} ${nameOf(catalog, slot.cardKey)}`);
}

/** Deck list text, one `3 Card Name` per line under a heading per non-empty section. */
export function formatDeckText(deck: Deck, catalog: Catalog): string {
  const sections: Record<DeckSection, string[]> = {
    legend: deck.legendKey ? [`1 ${nameOf(catalog, deck.legendKey)}`] : [],
    champion: deck.chosenChampionKey ? [`1 ${nameOf(catalog, deck.chosenChampionKey)}`] : [],
    main: slotLines(deck.main, catalog),
    runes: slotLines(deck.runes, catalog),
    battlefields: slotLines(deck.battlefields, catalog),
    sideboard: slotLines(deck.sideboard, catalog),
  };
  const blocks = SECTION_ORDER.filter((section) => sections[section].length > 0).map((section) =>
    [DECK_SECTION_TITLES[section], ...sections[section]].join('\n'),
  );
  return [`Deck: ${deck.name}`, ...blocks].join('\n\n') + '\n';
}

type LineKind =
  | { kind: 'skip' }
  | { kind: 'name'; name: string }
  | { kind: 'heading'; section: DeckSection }
  | { kind: 'card'; text: string; sideboard: boolean };

const SIDEBOARD_PREFIX = /^sb\s*:\s*/i;
const TRAILING_COUNT = /\(\s*\d+\s*\)|:\s*\d*\s*$/g;
const QUANTITY_FIRST = /^(\d+)\s*[x×]?\s+(.+)$/i;
const MARKED_QUANTITY_FIRST = /^[x×](\d+)\s+(.+)$/i;
const QUANTITY_LAST = /^(.+?)\s+[x×]\s*(\d+)$/i;
const NEGATIVE_QUANTITY = /^-\d+\s/;
const TRAILING_COMMENT = /\s\/\/ ?[^]*$/;

function headingOf(line: string): DeckSection | undefined {
  if (/^\d/.test(line)) return undefined;
  return DECK_HEADING_ALIASES[normalizeText(line.replace(TRAILING_COUNT, ''))];
}

function nameDirective(line: string): string | undefined {
  const match = /^([a-z]+)\s*:\s*(\S.*)$/i.exec(line);
  return match && DECK_NAME_KEYS.includes(match[1]!.toLowerCase()) ? match[2]!.trim() : undefined;
}

/** Remove bracketed set references and extra spaces. Comments are handled during name lookup. */
const stripBrackets = (line: string): string => line.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

function classifyLine(rawLine: string): LineKind {
  const line = rawLine.replace(/^﻿/, '').trim();
  if (line === '') return { kind: 'skip' };
  const heading = headingOf(line);
  if (heading) return { kind: 'heading', section: heading };
  if (DECK_COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix))) return { kind: 'skip' };
  const name = nameDirective(line);
  if (name) return { kind: 'name', name };
  const sideboard = SIDEBOARD_PREFIX.test(line);
  const text = stripBrackets(line.replace(SIDEBOARD_PREFIX, ''));
  return text === '' ? { kind: 'skip' } : { kind: 'card', text, sideboard };
}

function parseQuantityAndName(line: string): { quantity: number; name: string } {
  const first = QUANTITY_FIRST.exec(line) ?? MARKED_QUANTITY_FIRST.exec(line);
  if (first) return { quantity: Number(first[1]), name: first[2]!.trim() };
  const last = QUANTITY_LAST.exec(line);
  if (last) return { quantity: Number(last[2]), name: last[1]!.trim() };
  return { quantity: 1, name: line };
}

const byCardKey = (a: Card, b: Card): number => (a.cardKey < b.cardKey ? -1 : 1);

/** Find the card a deck line names: exact, then without parentheticals, then fuzzy. */
function findCard(name: string, index: CatalogIndex, section: DeckSection, session: FuzzySession): Card | undefined {
  const forms = [normalizeText(name), normalizeText(splitParentheticals(name).base)].filter((f) => f !== '');
  const accepts = SECTION_RULES[section]?.accepts;
  const wanted = SECTION_PREFERRED_TYPE[section];
  for (const form of forms) {
    const cards = index.cardsByName.get(form);
    if (cards) {
      const sorted = [...cards].sort(byCardKey);
      return sorted.find((card) => accepts?.(card)) ?? sorted.find((card) => card.type === wanted) ?? sorted[0];
    }
  }
  for (const form of forms) {
    const found = fuzzyFindCard(index, form, session);
    if (found) return found.card;
  }
  return undefined;
}

interface Resolved {
  quantity: number;
  name: string;
  card?: Card;
}

/**
 * Resolve a card line. The whole line is tried as a name first, so names containing `//`
 * (for example "Gold // Buff") work. Only if nothing matches is a trailing comment stripped.
 */
function resolveCardLine(text: string, index: CatalogIndex, section: DeckSection, session: FuzzySession): Resolved {
  const whole = parseQuantityAndName(text);
  const card = findCard(whole.name, index, section, session);
  if (card || !TRAILING_COMMENT.test(text)) return { ...whole, card };
  const stripped = parseQuantityAndName(text.replace(TRAILING_COMMENT, '').trim());
  return { ...stripped, card: findCard(stripped.name, index, section, session) };
}

/** Where a card goes: Legends, Runes and Battlefields have homes unless a dedicated section says otherwise. */
function destinationSection(card: Card, current: DeckSection): DeckSection {
  if (card.type === 'Legend') return 'legend';
  const home = TYPE_HOME_SECTION[card.type];
  return home && current === 'main' ? home : current;
}

class DeckBuilder {
  private readonly counts: Record<SlotSection, Map<string, number>> = {
    main: new Map(),
    runes: new Map(),
    battlefields: new Map(),
    sideboard: new Map(),
  };
  legendKey: string | undefined;
  championKey: string | undefined;

  /** Returns a reason when the card cannot be placed. */
  place(section: DeckSection, card: Card, quantity: number): string | null {
    if (section === 'legend') return this.setSingle('legendKey', card, 'Legend');
    if (section === 'champion') return this.setSingle('championKey', card, 'champion');
    const map = this.counts[section];
    const total = (map.get(card.cardKey) ?? 0) + quantity;
    if (total > IO_CONFIG.maxDeckCount) return `total ${total} is over ${IO_CONFIG.maxDeckCount}`;
    map.set(card.cardKey, total);
    return null;
  }

  private setSingle(field: 'legendKey' | 'championKey', card: Card, label: string): string | null {
    if (this[field] !== undefined && this[field] !== card.cardKey) return `a second ${label}`;
    this[field] = card.cardKey;
    return null;
  }

  slots(section: SlotSection): DeckSlot[] {
    const slots = [...this.counts[section]].map(([cardKey, count]) => ({ cardKey, count }));
    // The chosen champion is part of the main deck even when only listed under Champion.
    if (section === 'main' && this.championKey && !this.counts.main.has(this.championKey)) {
      slots.push({ cardKey: this.championKey, count: 1 });
    }
    return slots;
  }
}

/** Why a quantity cannot be used, or null when it is fine. */
function quantityProblem(quantity: number): string | null {
  if (quantity <= 0) return `quantity ${quantity}`;
  return quantity > IO_CONFIG.maxDeckCount ? `quantity ${quantity} is over ${IO_CONFIG.maxDeckCount}` : null;
}

/** Why this card cannot go in this section, or null when it can. */
function typeProblem(card: Card, section: DeckSection): string | null {
  const rule = SECTION_RULES[section];
  return rule && !rule.accepts(card) ? rule.rejection : null;
}

/**
 * Parse a deck list. Accepts `3 Name`, `3x Name`, `Name x3`, bare names, headings in common
 * variants, `SB:` prefixes and comments. Anything that cannot be placed is returned in
 * `unmatched`, with a reason in parentheses when the name itself was understood.
 */
export function parseDeckText(
  text: string,
  catalog: Catalog,
  now: number,
): { deck: Deck; unmatched: string[] } {
  const index = getCatalogIndex(catalog);
  const session = newFuzzySession();
  const builder = new DeckBuilder();
  const unmatched = new Set<string>();
  let section: DeckSection = 'main';
  let name: string = IO_CONFIG.defaultDeckName;

  if (text.length > IO_CONFIG.maxDeckTextChars) {
    return { deck: emptyDeckFrom(name, now), unmatched: [`(deck text longer than ${IO_CONFIG.maxDeckTextChars} characters was not read)`] };
  }
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > IO_CONFIG.maxDeckLines) {
    unmatched.add(`(${lines.length - IO_CONFIG.maxDeckLines} lines past the ${IO_CONFIG.maxDeckLines} line limit were ignored)`);
  }
  for (const raw of lines.slice(0, IO_CONFIG.maxDeckLines)) {
    if (raw.length > IO_CONFIG.maxDeckLineChars) {
      unmatched.add(`${raw.slice(0, 40).trim()}... (line longer than ${IO_CONFIG.maxDeckLineChars} characters)`);
      continue;
    }
    const line = classifyLine(raw);
    if (line.kind === 'heading') section = line.section;
    else if (line.kind === 'name') name = line.name;
    else if (line.kind === 'card') {
      const target: DeckSection = line.sideboard ? 'sideboard' : section;
      const problem = placeCardLine(line.text, target, index, builder, session);
      if (problem) unmatched.add(problem);
    }
  }
  if (session.exhausted) {
    unmatched.add(`(fuzzy name matching stopped after ${IO_CONFIG.maxFuzzyLookups} distinct names)`);
  }
  const deck: Deck = {
    ...emptyDeckFrom(name, now),
    main: builder.slots('main'),
    runes: builder.slots('runes'),
    battlefields: builder.slots('battlefields'),
    sideboard: builder.slots('sideboard'),
  };
  if (builder.legendKey) deck.legendKey = builder.legendKey;
  if (builder.championKey) deck.chosenChampionKey = builder.championKey;
  return { deck, unmatched: [...unmatched] };
}

function emptyDeckFrom(name: string, now: number): Deck {
  return { id: newRecordId(), updatedAt: now, name, main: [], runes: [], battlefields: [], sideboard: [] };
}

/** Place one card line; returns the text to report when it could not be placed. */
function placeCardLine(
  text: string,
  target: DeckSection,
  index: CatalogIndex,
  builder: DeckBuilder,
  session: FuzzySession,
): string | null {
  if (NEGATIVE_QUANTITY.test(text)) return `${text} (negative quantity)`;
  const { quantity, name, card } = resolveCardLine(text, index, target, session);
  if (!card) return name;
  const reason =
    quantityProblem(quantity) ?? typeProblem(card, target) ?? builder.place(destinationSection(card, target), card, quantity);
  return reason ? `${name} (${reason})` : null;
}
