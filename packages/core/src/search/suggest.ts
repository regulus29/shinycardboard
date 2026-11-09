import { CARD_TYPES, DOMAINS, KEYWORDS, RARITIES } from '../catalog/vocabulary';
import type { Catalog } from '../types';
import { FIELD_SUGGESTIONS, lookupField, type FieldSpec } from './fields';
import { foldText } from './fold';
import { getIndex, type SearchIndex } from './index-build';
import type { SearchContext } from './types';

/** Most suggestions returned, and how many of them may be card names. */
export const SUGGESTION_LIMIT = 8;
export const NAME_SUGGESTION_LIMIT = 4;
/** Card refs offered after a set word (`ogn 4` gives `ogn 40`, `ogn 41`, ...). */
export const NUMBER_SUGGESTION_LIMIT = 6;
/** Names are only suggested once the user has typed this many characters. */
const MIN_NAME_PREFIX = 1;
/** Longest run of preceding words that may be replaced by a multi-word name. */
const MAX_NAME_WORDS = 4;

const FIELD_VALUE = /^([A-Za-z]+):(.*)$/;
const PLAIN_WORD = /^[A-Za-z0-9'\u2019-]+$/;
const OWNED_VALUES = ['yes', 'no', 'foil', 'nonfoil'];
const VARIANT_VALUES = ['standard', 'alternate-art', 'overnumbered', 'signature', 'metal'];
/** Example values offered after a numeric field, since any number is valid. */
const NUMBER_HINTS = ['0', '1', '2', '3', '4', '5', '>=3', '<=2', '2..4'];
/** Presence tests offered after tag: and deck:. */
const PRESENCE_HINTS = ['any', 'none'];
const SUPERTYPE_VALUES = ['champion', 'signature', 'token', 'basic'];

/** Replace `input.slice(start)` with `text`. */
export interface Suggestion {
  start: number;
  text: string;
}

interface TokenSpan {
  text: string;
  start: number;
}

/** Start offset of the token being typed. An unclosed quote keeps the whole quoted value in the token. */
export function lastTokenStart(input: string): number {
  let start = 0;
  let inQuote = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && /[\s()|]/.test(ch)) start = i + 1;
  }
  return start;
}

/** Whitespace separated tokens of `input` with their offsets. */
function spans(input: string): TokenSpan[] {
  return [...input.matchAll(/\S+/g)].map((match) => ({ text: match[0], start: match.index ?? 0 }));
}

function quoteIfNeeded(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
}

function startsWithFolded(candidate: string, folded: string): boolean {
  const target = foldText(candidate);
  return target.startsWith(folded) && target !== folded;
}

function userValues(ctx: SearchContext, field: 'tag' | 'deck'): string[] {
  const lists = Object.values(field === 'tag' ? (ctx.tagsByCard ?? {}) : (ctx.decksByCard ?? {}));
  return [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));
}

function valuesForField(spec: FieldSpec, catalog: Catalog, ctx: SearchContext): string[] {
  if (spec.kind === 'owned') return OWNED_VALUES;
  if (spec.kind === 'user') return [...userValues(ctx, spec.field), ...PRESENCE_HINTS];
  if (spec.kind === 'number') return NUMBER_HINTS;
  if (spec.kind === 'text') return spec.field === 'artist' ? getIndex(catalog).artists : [];
  switch (spec.field) {
    case 'set':
      return catalog.sets.map((set) => set.setId.toLowerCase());
    case 'type':
      return CARD_TYPES.map((type) => type.toLowerCase());
    case 'supertype':
      return SUPERTYPE_VALUES;
    case 'domain':
      return DOMAINS.map((domain) => domain.toLowerCase());
    case 'rarity':
      return RARITIES.map((rarity) => rarity.toLowerCase());
    case 'keyword':
      return KEYWORDS.map((keyword) => keyword.toLowerCase());
    case 'variant':
      return VARIANT_VALUES;
  }
}

/** Comparison hints such as `>=3` attach directly to the field name instead of after a colon. */
function numericSeparator(spec: FieldSpec, value: string): string {
  return spec.kind === 'number' && /^[<>]/.test(value) ? '' : ':';
}

function fieldValueCompletions(field: string, partial: string, catalog: Catalog, ctx: SearchContext): string[] {
  const spec = lookupField(field);
  if (!spec) return [];
  const folded = foldText(partial.replace(/"/g, ''));
  return valuesForField(spec, catalog, ctx)
    .filter((value) => !folded || startsWithFolded(value, folded))
    .map((value) => `${field}${numericSeparator(spec, value)}${quoteIfNeeded(value)}`);
}

/** Longest trailing run of plain words (including the one being typed) that begins a card name. */
function nameCompletions(spansBefore: TokenSpan[], index: SearchIndex): Suggestion[] {
  const run: TokenSpan[] = [];
  for (let i = spansBefore.length - 1; i >= 0 && run.length < MAX_NAME_WORDS; i--) {
    const span = spansBefore[i] as TokenSpan;
    if (!PLAIN_WORD.test(span.text)) break;
    run.unshift(span);
  }
  for (let length = run.length; length >= 1; length--) {
    const used = run.slice(run.length - length);
    const phrase = foldText(used.map((span) => span.text).join(' '));
    const typed = used.map((span) => span.text).join(' ');
    if (phrase.length < MIN_NAME_PREFIX) continue;
    const matches = length === 1 ? matchingHeads(index, phrase, true) : matchingNames(index, phrase);
    const found = matches.filter((name) => name !== typed);
    if (found.length > 0) return found.map((text) => ({ start: (used[0] as TokenSpan).start, text }));
  }
  return [];
}

/** Full card names that start with a multi-word phrase, most printed first (`jinx r` gives `Jinx - Rebel`). */
function matchingNames(index: SearchIndex, phrase: string): string[] {
  const found: string[] = [];
  for (const name of index.names) {
    if (name.folded.startsWith(phrase)) found.push(name.text);
    if (found.length >= NAME_SUGGESTION_LIMIT) break;
  }
  return found;
}

/** The exact head first, then heads starting with the phrase, then (one word) heads with a word that does. */
function matchingHeads(index: SearchIndex, phrase: string, allowWordPrefix: boolean): string[] {
  const exact: string[] = [];
  const starts: string[] = [];
  const inside: string[] = [];
  for (const head of index.nameHeads) {
    if (head.folded === phrase) exact.push(head.text);
    else if (head.folded.startsWith(phrase)) starts.push(head.text);
    else if (allowWordPrefix && head.folded.includes(` ${phrase}`)) inside.push(head.text);
    if (starts.length >= NAME_SUGGESTION_LIMIT) break;
  }
  return [...exact, ...starts, ...inside].slice(0, NAME_SUGGESTION_LIMIT);
}

/** `ogn 4` gives `ogn 40`, `ogn 41`: real standard card numbers of that set. */
function numberCompletions(before: TokenSpan | undefined, digits: string, index: SearchIndex): Suggestion[] {
  if (!before || !PLAIN_WORD.test(before.text)) return [];
  const code = index.setAliasCodes.get(foldText(before.text));
  const trimmed = digits.replace(/^0+/, '') || digits;
  if (!code) return [];
  return (index.numbersBySet.get(code) ?? [])
    .filter((number) => String(number).startsWith(trimmed) && String(number) !== trimmed)
    .slice(0, NUMBER_SUGGESTION_LIMIT)
    .map((number) => ({ start: before.start, text: `${before.text} ${number}` }));
}

function vocabularyCompletions(folded: string, index: SearchIndex, ctx: SearchContext): string[] {
  const words = [...DOMAINS, ...CARD_TYPES, ...RARITIES].map((word) => word.toLowerCase());
  const values = words.filter((word) => startsWithFolded(word, folded));
  const sets = [...index.setAliasCodes]
    .filter(([alias]) => alias.startsWith(folded))
    .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
    .map(([, code]) => `set:${code}`);
  const keywords = KEYWORDS.filter((word) => startsWithFolded(word, folded)).map((word) => `keyword:${word.toLowerCase()}`);
  const variants = VARIANT_VALUES.filter((word) => startsWithFolded(word, folded)).map((word) => `variant:${word}`);
  const fields = FIELD_SUGGESTIONS.filter((field) => field.name.startsWith(folded)).map((field) => `${field.name}:`);
  const tags = userValues(ctx, 'tag')
    .filter((tag) => startsWithFolded(tag, folded))
    .map((tag) => `tag:${quoteIfNeeded(tag)}`);
  return [...values, ...sets, ...keywords, ...variants, ...fields, ...tags];
}

/**
 * Completions for the token being typed. Each says which part of the input to replace, so a
 * multi-word name replaces every word it covers (`red bramb` becomes `Red Brambleback`).
 * A leading `-` (negation) is preserved.
 */
export function suggestTokens(input: string, catalog: Catalog, ctx: SearchContext): Suggestion[] {
  const index = getIndex(catalog);
  const start = lastTokenStart(input);
  const token = input.slice(start);
  const negation = token.startsWith('-') && token.length > 1 ? '-' : '';
  const body = negation ? token.slice(1) : token;
  const fieldMatch = FIELD_VALUE.exec(body);
  const all = spans(input);

  let found: Suggestion[];
  if (fieldMatch) {
    found = fieldValueCompletions(fieldMatch[1] as string, fieldMatch[2] as string, catalog, ctx).map((text) => ({ start, text }));
  } else if (/^\d+$/.test(body)) {
    found = numberCompletions(all[all.length - 2], body, index);
  } else {
    const folded = foldText(body);
    const names = negation || !folded ? [] : nameCompletions(all, index);
    const vocabulary = folded ? vocabularyCompletions(folded, index, ctx).map((text) => ({ start, text })) : [];
    found = [...names, ...vocabulary];
  }
  const seen = new Set<string>();
  return found
    .map((suggestion) => ({ start: suggestion.start, text: negation + suggestion.text }))
    .filter((suggestion) => {
      const key = `${suggestion.start}:${suggestion.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SUGGESTION_LIMIT);
}

/**
 * Short suggestions for the omnibox as the user types (card names, field names, set titles,
 * keywords, tags). Each string is the full query with the typed words replaced, so the UI can
 * set it directly.
 */
export function suggest(input: string, catalog: Catalog, ctx: SearchContext): string[] {
  return suggestTokens(input, catalog, ctx).map(({ start, text }) => input.slice(0, start) + text);
}
