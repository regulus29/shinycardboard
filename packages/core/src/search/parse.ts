import { isPlainNumber, isSetLike, parseCompactRef, parseNumberRef } from './cardref';
import {
  BARE_KEYWORDS,
  lookupField,
  MAX_PHRASE_WORDS,
  STATIC_PHRASES,
  VARIANT_ALIASES,
  type FieldSpec,
} from './fields';
import { foldText } from './fold';
import { lex, type Token } from './lexer';
import type {
  CardRefClause,
  Clause,
  EnumClause,
  NumericField,
  NumericOp,
  NumericTest,
  OwnedTest,
  ParseOptions,
  ParsedQuery,
  ParseWarning,
  PhraseTarget,
  UserListClause,
} from './types';

/** Longest query that is parsed; the rest is ignored with a warning. */
export const MAX_QUERY_LENGTH = 500;
/** Deepest parenthesis nesting that is honoured; deeper parentheses are ignored. */
export const MAX_GROUP_DEPTH = 6;
/** Relevance of a set title, keyword or label word, so it outranks rules-text mentions but not exact names. */
export const FACET_WORD_WEIGHT = 110;

const FIELD_PREFIX = /^([A-Za-z]+)(>=|<=|!=|:|=|>|<)/;
const COMPARATOR_PREFIX = /^(>=|<=|!=|>|<|=)\s*(.*)$/;
const NUMBER_VALUE = /^\d+(?:\.\d+)?$/;
const RANGE_VALUE = /^(\d*(?:\.\d+)?)\.\.(\d*(?:\.\d+)?)$/;
const HASH_NUMBER = /^#?\d+$/;
/** Letters, an optional separator, then a number: `origins-42`, `unleashed29a`. */
const TITLE_WITH_NUMBER = /^([a-z]{4,})[-#/]*(#?\d.*)$/;
const YES_WORDS = new Set(['yes', 'y', 'true', 'any']);
const NO_WORDS = new Set(['no', 'n', 'false', 'none']);
/** Words that name a numeric stat when next to a number: `cost 3`, `3 might`. */
const STAT_WORDS: Readonly<Record<string, NumericField>> = {
  cost: 'energy',
  energy: 'energy',
  might: 'might',
  power: 'power',
};

function stripQuotes(text: string): string {
  return text.replace(/"/g, '');
}

/** Parse a numeric value that may be a range (`2..4`, `..4`, `3..`) or carry its own comparator (`>=3`). */
export function parseNumericTest(op: string, value: string): NumericTest | null {
  let effectiveOp = op === ':' ? '=' : op;
  let operand = value.trim();
  const comparator = COMPARATOR_PREFIX.exec(operand);
  if (comparator && effectiveOp === '=') {
    effectiveOp = comparator[1] as string;
    operand = (comparator[2] ?? '').trim();
  }
  const range = RANGE_VALUE.exec(operand);
  if (range && effectiveOp === '=') return rangeTest(range[1] ?? '', range[2] ?? '');
  if (!NUMBER_VALUE.test(operand)) return null;
  return { op: effectiveOp as NumericOp, value: Number.parseFloat(operand) };
}

function rangeTest(low: string, high: string): NumericTest | null {
  if (!low && !high) return null;
  if (!high) return { op: '>=', value: Number.parseFloat(low) };
  if (!low) return { op: '<=', value: Number.parseFloat(high) };
  const [min, max] = [Number.parseFloat(low), Number.parseFloat(high)].sort((a, b) => a - b);
  return { op: 'range', min: min as number, max: max as number };
}

function parseOwnedTest(op: string, value: string): OwnedTest | null {
  const word = value.trim().toLowerCase();
  if (word === 'foil') return { type: 'foil' };
  if (word === 'nonfoil' || word === 'normal') return { type: 'nonfoil' };
  if (YES_WORDS.has(word)) return { type: 'count', test: { op: '>=', value: 1 } };
  if (NO_WORDS.has(word)) return { type: 'count', test: { op: '=', value: 0 } };
  const test = parseNumericTest(op, word);
  return test ? { type: 'count', test } : null;
}

function splitValues(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEnumValue(field: EnumClause['field'], value: string): string {
  if (field === 'variant') return VARIANT_ALIASES[value] ?? value;
  return value;
}

/** A bare word the parser can read as a plain search word: no quotes, field, negation or parentheses. */
function plainWordAt(token: Token | undefined): string | null {
  if (token?.kind !== 'word') return null;
  const { source } = token;
  if (source.includes('"') || source.startsWith('-') || FIELD_PREFIX.test(source)) return null;
  return source.toLowerCase();
}

function namesVariant(clause: Clause): boolean {
  if (clause.negated) return false;
  if (clause.kind === 'enum') return clause.field === 'variant';
  return clause.kind === 'group' && clause.branches.flat().some(namesVariant);
}

/**
 * When a query names a variant (`unl 29 alt`, `unl 229 sig`), a card reference without a marker
 * should not be limited to the unmarked printing. Walks one level of AND clauses and the groups
 * inside them.
 */
function relaxMarkers(clauses: Clause[]): void {
  if (!clauses.some(namesVariant)) return;
  const visit = (clause: Clause) => {
    if (clause.kind === 'cardRef') clause.anyMarker = true;
    if (clause.kind === 'group') clause.branches.flat().forEach(visit);
  };
  clauses.forEach(visit);
}

/** Marks the group built from `fury or calm`, so a longer chain extends it instead of nesting. */
const FACET_OR_SOURCE = 'or';
const LOWER_OR = 'or';

/** Recursive descent over lexer tokens: OR of ANDs, with parentheses and negation. */
class Parser {
  readonly warnings: ParseWarning[] = [];
  /** True when a term was dropped because it held no letters or digits. */
  sawEmptyTerm = false;
  private position = 0;
  private ignoredParens = 0;
  private readonly known: ReadonlySet<string> | null;
  private readonly phrases: ReadonlyMap<string, PhraseTarget>;
  private readonly printingLookup: ReadonlyMap<string, readonly string[]>;

  constructor(
    private readonly tokens: Token[],
    options: ParseOptions,
  ) {
    this.known = options.knownSets ? new Set(options.knownSets.map((set) => set.toLowerCase())) : null;
    this.printingLookup = options.printingLookup ?? new Map();
    this.phrases = options.phrases ? new Map([...STATIC_PHRASES, ...options.phrases]) : STATIC_PHRASES;
  }

  parse(): Clause[] {
    const branches = this.parseBranches(0);
    if (branches.length > 1) return [this.group(branches, false, 'OR')];
    return branches[0] ?? [];
  }

  private warn(token: string, message: string): void {
    this.warnings.push({ token, message });
  }

  /** Parse until the matching `)` (left for the caller to consume) or the end of input. */
  private parseBranches(depth: number): Clause[][] {
    const branches: Clause[][] = [[]];
    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position] as Token;
      if (token.kind === 'rparen' && depth > 0 && this.ignoredParens === 0) break;
      this.position++;
      const current = branches[branches.length - 1] as Clause[];
      if (token.kind === 'or') this.startBranch(branches, current);
      else if (token.kind === 'rparen') this.closeStray();
      else if (token.kind === 'lparen') this.openGroup(token, depth, current);
      else if (this.isFacetOr(token, current)) this.joinFacetOr(current);
      else current.push(...this.parseWord(token));
    }
    const last = branches[branches.length - 1] as Clause[];
    if (branches.length > 1 && last.length === 0) this.warn('OR', 'OR needs a term on its right side');
    const kept = branches.filter((branch) => branch.length > 0);
    kept.forEach(relaxMarkers);
    return kept;
  }

  /** Is the lowercase word `or` sitting between two facet or field words (`fury or calm`)? */
  private isFacetOr(token: Token, current: Clause[]): boolean {
    if (token.kind !== 'word' || token.source !== LOWER_OR || current.length === 0) return false;
    return this.isFacetToken(this.tokens[this.position - 2]) && this.isFacetToken(this.tokens[this.position]);
  }

  private isFacetToken(token: Token | undefined): boolean {
    if (token?.kind !== 'word' || token.source.startsWith('-')) return false;
    const field = FIELD_PREFIX.exec(token.source);
    if (field) return lookupField(field[1] as string) !== undefined;
    const lower = token.source.toLowerCase();
    return !token.source.includes('"') && (this.phrases.has(foldText(lower)) || BARE_KEYWORDS.has(lower));
  }

  /** Consume the right operand of a facet `or` and merge it with the previous clause into one OR group. */
  private joinFacetOr(current: Clause[]): void {
    const right = this.tokens[this.position++] as Extract<Token, { kind: 'word' }>;
    const left = current.pop() as Clause;
    const rightClauses = this.parseWord(right);
    if (left.kind === 'group' && left.source === FACET_OR_SOURCE) {
      current.push({ ...left, branches: [...left.branches, rightClauses] });
    } else {
      current.push(this.group([[left], rightClauses], false, FACET_OR_SOURCE));
    }
  }

  private startBranch(branches: Clause[][], current: Clause[]): void {
    if (current.length === 0) this.warn('OR', 'OR needs a term on its left side');
    else branches.push([]);
  }

  private closeStray(): void {
    if (this.ignoredParens > 0) this.ignoredParens--;
    else this.warn(')', 'Unmatched closing parenthesis');
  }

  private openGroup(token: Extract<Token, { kind: 'lparen' }>, depth: number, current: Clause[]): void {
    if (depth >= MAX_GROUP_DEPTH) {
      this.ignoredParens++;
      this.warn('(', 'Parentheses nested too deeply; ignored');
      return;
    }
    const inner = this.parseBranches(depth + 1);
    const next = this.tokens[this.position];
    if (next?.kind === 'rparen') this.position++;
    else this.warn('(', 'Missing closing parenthesis');
    if (inner.length === 0) return;
    if (inner.length === 1 && !token.negated) current.push(...(inner[0] as Clause[]));
    else current.push(this.group(inner, token.negated, token.negated ? '-(...)' : '(...)'));
  }

  private group(branches: Clause[][], negated: boolean, source: string): Clause {
    return { kind: 'group', branches, negated, source };
  }

  private parseWord(token: Extract<Token, { kind: 'word' }>): Clause[] {
    if (token.unterminatedQuote) this.warn(token.source, 'Missing closing quote');
    const negated = token.source.length > 1 && token.source.startsWith('-');
    const body = negated ? token.source.slice(1) : token.source;
    const fieldMatch = FIELD_PREFIX.exec(body);
    if (fieldMatch) {
      const spec = lookupField(fieldMatch[1] as string);
      if (spec) return this.fieldClause(spec, fieldMatch[2] as string, body.slice(fieldMatch[0].length), body, negated);
      this.warn(token.source, `Unknown field "${fieldMatch[1]}"; searched as text`);
    }
    return this.bareClause(body, token.source, negated);
  }

  private fieldClause(spec: FieldSpec, op: string, rawValue: string, source: string, negated: boolean): Clause[] {
    const quoted = rawValue.includes('"');
    const value = stripQuotes(rawValue).trim();
    if (!value) {
      this.warn(source, 'Missing value');
      return [];
    }
    const invert = op === '!=' ? !negated : negated;
    switch (spec.kind) {
      case 'enum':
        return this.enumClause(spec.field, value, source, invert);
      case 'number':
        return this.numberClause(spec.field, op, value, source, negated);
      case 'text':
        return this.textClause(spec.field, value, quoted, source, negated);
      case 'owned':
        return this.ownedClause(op, value, source, negated);
      case 'user':
        return [this.userClause(spec.field, value, source, invert)];
    }
  }

  private enumClause(field: EnumClause['field'], value: string, source: string, negated: boolean): Clause[] {
    const values = splitValues(value).map((entry) => normalizeEnumValue(field, entry));
    return values.length ? [{ kind: 'enum', field, values, negated, source }] : [];
  }

  private numberClause(field: NumericField, op: string, value: string, source: string, negated: boolean): Clause[] {
    const test = parseNumericTest(op, value);
    if (!test) {
      this.warn(source, `Expected a number, range like 2..4, or comparison for ${field}`);
      return [];
    }
    return [{ kind: 'number', field, test, negated, source }];
  }

  private textClause(field: 'name' | 'rules' | 'artist', value: string, phrase: boolean, source: string, negated: boolean): Clause[] {
    if (!foldText(value)) {
      this.warn(source, 'Nothing searchable in value');
      return [];
    }
    return [{ kind: 'text', field, text: value, phrase, negated, source }];
  }

  private ownedClause(op: string, value: string, source: string, negated: boolean): Clause[] {
    const test = parseOwnedTest(op, value);
    if (!test) {
      this.warn(source, 'owned: expects yes, no, foil, nonfoil, a count, or a comparison like >2');
      return [];
    }
    return [{ kind: 'owned', test, negated, source }];
  }

  private userClause(field: 'tag' | 'deck', value: string, source: string, negated: boolean): UserListClause {
    const values = splitValues(value);
    const only = values.length === 1 ? (values[0] as string) : '';
    let presence: UserListClause['presence'] = null;
    if (only === 'any' || only === 'yes') presence = 'any';
    else if (only === 'none' || only === 'no') presence = 'none';
    return { kind: 'user', field, values, presence, negated, source };
  }

  /** A word with no field: stat pair, phrase, card reference, number, keyword, or name text. */
  private bareClause(body: string, source: string, negated: boolean): Clause[] {
    if (body.includes('"')) {
      const text = stripQuotes(body).trim();
      if (foldText(text)) return [{ kind: 'phrase', text, negated, source }];
      this.sawEmptyTerm = true;
      return [];
    }
    const lower = body.toLowerCase();
    if (!foldText(lower)) {
      this.sawEmptyTerm = true;
      return [];
    }
    const printing = this.printingClause(lower, source, negated);
    if (printing) return [printing];
    const found =
      this.statClause(lower, source, negated) ??
      this.phraseClause(lower, source, negated) ??
      this.cardRefClause(lower, source, negated);
    return [found ?? this.keywordOrWord(lower, source, negated)];
  }

  /** A pasted printing key or source id (`ogn-042-298-standard`, `unl-029-219`, `unl-229*-219`). */
  private printingClause(lower: string, source: string, negated: boolean): Clause | null {
    const keys = this.printingLookup.get(lower.replace(/\*/g, 'x'));
    return keys && keys.length > 0 ? { kind: 'printing', keys: [...keys], negated, source } : null;
  }

  /** `cost 3` and `3 cost` (also energy, might, power). */
  private statClause(lower: string, source: string, negated: boolean): Clause | null {
    const nextWord = plainWordAt(this.tokens[this.position]);
    if (nextWord === null) return null;
    const statFirst = STAT_WORDS[lower];
    const numberFirst = STAT_WORDS[nextWord];
    const field = statFirst !== undefined && isPlainNumber(nextWord) ? statFirst : isPlainNumber(lower) ? numberFirst : undefined;
    if (field === undefined) return null;
    const value = Number.parseInt(isPlainNumber(nextWord) ? nextWord : lower, 10);
    this.position++;
    return { kind: 'number', field, test: { op: '=', value }, negated, source: `${source} ${nextWord}` };
  }

  /** Longest bare phrase starting here, for example `alt art` or `proving grounds`. */
  private matchPhrase(first: string): { target: PhraseTarget; words: string[] } | null {
    const words = [first];
    for (let i = this.position; i < this.tokens.length && words.length < MAX_PHRASE_WORDS; i++) {
      const next = plainWordAt(this.tokens[i]);
      if (next === null) break;
      words.push(next);
    }
    for (let length = words.length; length >= 1; length--) {
      const used = words.slice(0, length);
      const target = this.phrases.get(foldText(used.join(' ')));
      if (target) return { target, words: used };
    }
    return null;
  }

  private phraseClause(lower: string, source: string, negated: boolean): Clause | null {
    const match = this.matchPhrase(lower);
    if (!match) return null;
    const { target, words } = match;
    this.position += words.length - 1;
    const text = foldText(words.join(' '));
    const fullSource = words.length > 1 ? `${source} ${words.slice(1).join(' ')}` : source;
    if (target.kind === 'owned') return { kind: 'owned', test: target.test, negated, source: fullSource };
    if (target.isSet) {
      const ref = this.cardRefAfterSet(target.facets[0]?.values ?? [], fullSource, negated);
      if (ref) return ref;
    }
    return this.facetClause(target, text, fullSource, negated);
  }

  /** Set title or code followed by a number: `origins 42`, `unleashed #29a`, `ogn 042/298`. */
  private cardRefAfterSet(sets: string[], source: string, negated: boolean): CardRefClause | null {
    const next = this.tokens[this.position];
    const number = next?.kind === 'word' ? parseNumberRef(next.source) : null;
    if (!number || next?.kind !== 'word') return null;
    this.position++;
    return { kind: 'cardRef', sets, ...number, anyMarker: false, negated, source: `${source} ${next.source}` };
  }

  private facetClause(target: Extract<PhraseTarget, { kind: 'facets' }>, text: string, source: string, negated: boolean): Clause {
    const weight = target.orName ? FACET_WORD_WEIGHT : undefined;
    const enums: Clause[][] = target.facets.map((facet) => [
      { kind: 'enum', field: facet.field, values: facet.values, negated: false, source, ...(weight ? { weight } : {}) },
    ]);
    if (enums.length === 1 && !target.orName) return { ...(enums[0]?.[0] as EnumClause), negated };
    if (target.orName) enums.push([{ kind: 'word', text, negated: false, source }]);
    return this.group(enums, negated, source);
  }

  private cardRefClause(lower: string, source: string, negated: boolean): Clause | null {
    const compact = parseCompactRef(lower, this.known);
    if (compact) {
      const { set, ...rest } = compact;
      return { kind: 'cardRef', sets: [set], ...rest, anyMarker: false, negated, source };
    }
    const titled = this.titleWithNumber(lower, source, negated);
    if (titled) return titled;
    const next = this.tokens[this.position];
    if ((this.known === null || this.known.has(lower)) && isSetLike(lower) && next?.kind === 'word') {
      const ref = this.cardRefAfterSet([lower], source, negated);
      if (ref) return ref;
    }
    const bare = parseNumberRef(lower);
    if (!bare) return null;
    const ref: CardRefClause = { kind: 'cardRef', sets: null, ...bare, anyMarker: false, negated: false, source };
    // A lone number may also be a rules-text number ("draw 1"), so offer both readings.
    if (!HASH_NUMBER.test(lower)) return { ...ref, negated };
    const text = String(bare.number);
    return this.group([[ref], [{ kind: 'word', text, negated: false, source }]], negated, source);
  }

  /** One token with a set title and a number, such as `origins-42` or `unleashed29a`. */
  private titleWithNumber(lower: string, source: string, negated: boolean): CardRefClause | null {
    const match = TITLE_WITH_NUMBER.exec(lower);
    const target = match ? this.phrases.get(match[1] as string) : undefined;
    const number = match ? parseNumberRef(match[2] as string) : null;
    if (!target || target.kind !== 'facets' || !target.isSet || !number) return null;
    const sets = target.facets[0]?.values ?? [];
    return { kind: 'cardRef', sets, ...number, anyMarker: false, negated, source };
  }

  /** Keyword words match the keyword or the name; everything else is name text. */
  private keywordOrWord(lower: string, source: string, negated: boolean): Clause {
    if (this.known?.has(lower)) return { kind: 'enum', field: 'set', values: [lower], negated, source };
    const text = foldText(lower);
    const word: Clause = { kind: 'word', text, negated: false, source };
    if (!BARE_KEYWORDS.has(lower)) return { ...word, negated };
    const keyword: Clause = { kind: 'enum', field: 'keyword', values: [lower], negated: false, source };
    return this.group([[keyword], [word]], negated, source);
  }
}

/** Parse a query. Never throws; problems become warnings and the offending part is dropped or searched as text. */
export function parseQuery(input: string, options: ParseOptions = {}): ParsedQuery {
  const raw = typeof input === 'string' ? input : '';
  const truncated = raw.length > MAX_QUERY_LENGTH;
  const warnings: ParseWarning[] = truncated
    ? [{ token: raw.slice(MAX_QUERY_LENGTH, MAX_QUERY_LENGTH + 20), message: `Query truncated to ${MAX_QUERY_LENGTH} characters` }]
    : [];
  try {
    const parser = new Parser(lex(truncated ? raw.slice(0, MAX_QUERY_LENGTH) : raw), options);
    const clauses = parser.parse();
    const all = [...warnings, ...parser.warnings];
    if (clauses.length === 0 && parser.sawEmptyTerm && all.length === 0) {
      all.push({ token: raw, message: 'Nothing searchable in this query; showing everything' });
    }
    return { raw, clauses, warnings: all };
  } catch {
    // Defensive: the parser must never break the omnibox, so fall back to a single text term.
    const fallback = foldText(raw);
    const clauses: Clause[] = fallback ? [{ kind: 'word', text: fallback, negated: false, source: raw }] : [];
    return { raw, clauses, warnings: [...warnings, { token: raw, message: 'Could not parse query; searched as text' }] };
  }
}
