/** Pure helpers that edit omnibox query text, so filter chips and the search box share one source of truth. */

export type FilterField = 'domain' | 'type' | 'rarity' | 'variant' | 'set' | 'tag';

/** Field names (and aliases) the parser accepts for each chip field; the first is what chips write. */
const FIELD_ALIASES: Record<FilterField, readonly string[]> = {
  domain: ['domain', 'd', 'color', 'colour'],
  type: ['type', 't'],
  rarity: ['rarity', 'r'],
  variant: ['variant', 'v'],
  set: ['set', 's'],
  tag: ['tag'],
};

export interface QueryToken {
  text: string;
  start: number;
  end: number;
}

/** Split on whitespace outside quotes and parentheses. */
export function tokenizeQuery(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let begin = -1;
  let depth = 0;
  let inQuote = false;
  const close = (end: number) => {
    if (begin >= 0) tokens.push({ text: query.slice(begin, end), start: begin, end });
    begin = -1;
  };
  for (let i = 0; i < query.length; i++) {
    const ch = query.charAt(i);
    if (/\s/.test(ch) && !inQuote && depth === 0) {
      close(i);
      continue;
    }
    if (begin < 0) begin = i;
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === '(') depth += 1;
    else if (!inQuote && ch === ')') depth = Math.max(0, depth - 1);
  }
  close(query.length);
  return tokens;
}

const stripQuotes = (value: string) => value.replace(/^"|"$/g, '');

interface FieldToken {
  token: QueryToken;
  values: string[];
}

function matchFieldToken(token: QueryToken, field: FilterField): FieldToken | null {
  const match = /^([a-z]+):(.*)$/i.exec(token.text);
  if (!match || !FIELD_ALIASES[field].includes((match[1] ?? '').toLowerCase())) return null;
  const raw = match[2] ?? '';
  const values = raw.startsWith('"') ? [stripQuotes(raw)] : raw.split(',').filter(Boolean);
  return { token, values };
}

function findFieldToken(query: string, field: FilterField): FieldToken | null {
  for (const token of tokenizeQuery(query)) {
    const found = matchFieldToken(token, field);
    if (found) return found;
  }
  return null;
}

/** Values currently filtered for a field (lower case), for chip selected state. */
export function fieldValues(query: string, field: FilterField): string[] {
  return findFieldToken(query, field)?.values.map((value) => value.toLowerCase()) ?? [];
}

const formatValue = (value: string) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value);

/** True when the query has a top-level OR, where appending a term would bind to the last branch only. */
function hasTopLevelOr(query: string): boolean {
  return tokenizeQuery(query).some((token) => token.text === '|' || token.text.toUpperCase() === 'OR');
}

function appendTerm(query: string, term: string): string {
  const base = query.trim();
  if (!base) return term;
  return `${hasTopLevelOr(base) ? `(${base})` : base} ${term}`;
}

function replaceToken(query: string, token: QueryToken, replacement: string): string {
  const before = query.slice(0, token.start).trimEnd();
  const after = query.slice(token.end).trimStart();
  return [before, replacement, after].filter(Boolean).join(' ');
}

/** Add the value when absent, remove it when present. Several values of one field share a comma list. */
export function toggleFieldValue(query: string, field: FilterField, value: string): string {
  const key = FIELD_ALIASES[field][0];
  const found = findFieldToken(query, field);
  if (!found) return appendTerm(query, `${key}:${formatValue(value)}`);
  const lower = value.toLowerCase();
  const exists = found.values.some((v) => v.toLowerCase() === lower);
  const values = exists ? found.values.filter((v) => v.toLowerCase() !== lower) : [...found.values, value];
  if (values.length === 0) return replaceToken(query, found.token, '');
  return replaceToken(query, found.token, `${key}:${values.map(formatValue).join(',')}`);
}

/** Drop every term for a field. */
export function clearField(query: string, field: FilterField): string {
  const found = findFieldToken(query, field);
  return found ? clearField(replaceToken(query, found.token, ''), field) : query.trim();
}

/** Engine warnings plus ours, without repeating a token the engine already flagged. */
export function mergeWarnings<T extends { token: string }>(engine: readonly T[], query: string): (T | { token: string; message: string })[] {
  const flagged = new Set(engine.map((warning) => warning.token));
  return [...engine, ...numericWarnings(query).filter((warning) => !flagged.has(warning.token))];
}

const NUMERIC_FIELDS = ['energy', 'cost', 'might', 'power', 'number'];
const NUMERIC_TOKEN = /^(-?)([a-z]+)(>=|<=|!=|[<>=:])(.*)$/i;
const NUMERIC_VALUE = /^(-?\d+(\.\.-?\d*)?|\.\.-?\d+)$/;

/**
 * Warnings the search engine does not raise: a numeric field compared with something that is not a
 * number (`energy>=abc`) matches everything, so say so instead of silently ignoring it.
 */
export function numericWarnings(query: string): { token: string; message: string }[] {
  const warnings: { token: string; message: string }[] = [];
  for (const token of tokenizeQuery(query)) {
    const match = NUMERIC_TOKEN.exec(token.text);
    const field = match?.[2]?.toLowerCase() ?? '';
    const values = (match?.[4] ?? '').split(',').filter(Boolean);
    if (!match || !NUMERIC_FIELDS.includes(field) || values.length === 0) continue;
    if (values.some((value) => !NUMERIC_VALUE.test(value))) {
      warnings.push({ token: token.text, message: `"${token.text}": ${field} needs a number, so this filter was ignored` });
    }
  }
  return warnings;
}
