import type { Suggestion } from '@sc/core';
import { ROUTES } from '../../app/paths';
import { writeParams } from '../collection/params';

/** Clickable examples in the help popover and the empty omnibox panel. */
export const SYNTAX_EXAMPLES: readonly { query: string; note: string }[] = [
  { query: 'unleashed 29', note: 'Set name plus card number' },
  { query: 'fury unit energy>=3', note: 'Domain, type and a numeric comparison' },
  { query: 'owned:yes', note: 'Only cards you own (also owned:no, owned:foil, owned:>2)' },
  { query: 'tag:"aggro"', note: 'Cards with one of your tags' },
  { query: '042/298', note: 'Printed number out of set size' },
];

/** One line per field family, shown under the examples. */
export const SYNTAX_FIELDS: readonly { field: string; values: string }[] = [
  { field: 'set, number', values: 'set:ogn  number:42  ogn 42  OGN-042' },
  { field: 'domain, type, rarity', values: 'domain:fury,calm  type:unit  rarity:epic' },
  { field: 'energy, might, power', values: 'energy>=3  might<2  cost:2..4' },
  { field: 'variant, owned', values: 'variant:alt  owned:foil  owned:>2' },
  { field: 'tag, deck, text', values: 'tag:none  deck:any  text:"draw 1"' },
  { field: 'exclude, group', values: '-domain:fury  (fury OR calm) unit' },
];

/** The query after accepting a suggestion. Field prefixes stay open so the value can be typed next. */
export function applySuggestion(input: string, suggestion: Suggestion): string {
  const text = input.slice(0, suggestion.start) + suggestion.text;
  return suggestion.text.endsWith(':') ? text : `${text} `;
}

export interface NextLocation {
  pathname: string;
  search: string;
  replace: boolean;
}

/**
 * Where a query commit navigates. On the collection page only `q` changes (scope, sort, group and
 * view stay); elsewhere it opens the collection. Typing replaces history on the collection so Back
 * does not walk through every keystroke.
 */
export function queryLocation(current: { pathname: string; search: string }, query: string): NextLocation {
  const onCollection = current.pathname === ROUTES.collection;
  const base = onCollection ? new URLSearchParams(current.search) : new URLSearchParams();
  const search = writeParams(base, { query }).toString();
  return { pathname: ROUTES.collection, search: search ? `?${search}` : '', replace: onCollection };
}

/** Field names the query language understands, offered as completions while typing a bare word. */
export const QUERY_FIELDS: readonly string[] = [
  'set',
  'number',
  'type',
  'supertype',
  'domain',
  'rarity',
  'energy',
  'cost',
  'might',
  'power',
  'text',
  'name',
  'keyword',
  'tag',
  'variant',
  'owned',
  'deck',
  'artist',
];
const FIELD_SUGGESTION_LIMIT = 3;

/** `en` becomes `energy:`. Only a partial bare word at the end of the input qualifies. */
export function fieldSuggestions(input: string): Suggestion[] {
  const match = /(?:^|[\s(|-])([a-z]+)$/i.exec(input);
  const partial = match?.[1]?.toLowerCase();
  if (!match || !partial) return [];
  const start = input.length - partial.length;
  return QUERY_FIELDS.filter((field) => field.startsWith(partial) && field !== partial)
    .slice(0, FIELD_SUGGESTION_LIMIT)
    .map((field) => ({ start, text: `${field}:` }));
}

/** Field suggestions first, then the engine's, without duplicates. */
export function mergeSuggestions(input: string, engine: readonly Suggestion[]): Suggestion[] {
  const fields = fieldSuggestions(input);
  const seen = new Set(fields.map((s) => s.text));
  return [...fields, ...engine.filter((s) => !seen.has(s.text))];
}

/** Short type hint for a suggestion row: what kind of thing accepting it inserts. */
export function describeSuggestion(suggestion: Suggestion): string {
  const text = suggestion.text;
  if (text.endsWith(':')) return 'Field';
  const field = /^-?([a-z]+)[:<>=!]/i.exec(text)?.[1];
  if (field) return `${field.charAt(0).toUpperCase()}${field.slice(1).toLowerCase()} filter`;
  if (/^\d/.test(text)) return 'Number';
  return 'Card or word';
}
