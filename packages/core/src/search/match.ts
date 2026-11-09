import type { Clause, NumericTest, OwnedTest, SearchContext } from './types';
import { editDistance, foldText, MIN_PREFIX_TYPO_LENGTH, MIN_SUBSTRING_LENGTH, maxEdits, tokenize } from './fold';
import type { CardInfo, Entry, SearchIndex } from './index-build';

/** A compiled clause: returns 0 for no match, otherwise a positive relevance score. */
export type Matcher = (entry: Entry) => number;

/** Relevance weights. Name quality dominates; filters only need to be positive. */
export const SCORE = {
  filter: 1,
  exactWord: 100,
  prefixWord: 80,
  substringWord: 50,
  fuzzyWord: 40,
  fuzzyPenalty: 10,
  fuzzyPrefix: 30,
  tag: 20,
  rulesExactWord: 15,
  rulesPrefixWord: 12,
  namePhrase: 90,
  rulesPhrase: 30,
  cardRef: 200,
} as const;

/** Per-run view of user state, built lazily so queries without owned:/tag:/deck: pay nothing. */
export class MatchEnv {
  private ownedMap: Map<string, OwnedTotals> | null = null;
  private tagMap: Map<string, string[]> | null = null;
  private deckMap: Map<string, string[]> | null = null;

  constructor(
    readonly index: SearchIndex,
    private readonly ctx: SearchContext,
  ) {}

  owned(printingKey: string): OwnedTotals {
    this.ownedMap ??= totalsByPrinting(this.ctx);
    return this.ownedMap.get(printingKey) ?? NOT_OWNED;
  }

  userList(field: 'tag' | 'deck', cardKey: string): string[] {
    if (field === 'tag') {
      this.tagMap ??= foldLists(this.ctx.tagsByCard);
      return this.tagMap.get(cardKey) ?? [];
    }
    this.deckMap ??= foldLists(this.ctx.decksByCard);
    return this.deckMap.get(cardKey) ?? [];
  }
}

export interface OwnedTotals {
  total: number;
  foil: number;
  normal: number;
}

const NOT_OWNED: OwnedTotals = { total: 0, foil: 0, normal: 0 };

function totalsByPrinting(ctx: SearchContext): Map<string, OwnedTotals> {
  const totals = new Map<string, OwnedTotals>();
  for (const entry of ctx.owned ?? []) {
    if (entry.deleted || entry.quantity <= 0) continue;
    const current = totals.get(entry.printingKey) ?? { total: 0, foil: 0, normal: 0 };
    current.total += entry.quantity;
    if (entry.finish === 'foil') current.foil += entry.quantity;
    else current.normal += entry.quantity;
    totals.set(entry.printingKey, current);
  }
  return totals;
}

function foldLists(source: Record<string, string[]> | undefined): Map<string, string[]> {
  return new Map(Object.entries(source ?? {}).map(([key, values]) => [key, values.map(foldText)]));
}

export function evaluateNumeric(test: NumericTest, value: number | null): boolean {
  if (value === null) return false;
  switch (test.op) {
    case '=':
      return value === test.value;
    case '!=':
      return value !== test.value;
    case '<':
      return value < test.value;
    case '<=':
      return value <= test.value;
    case '>':
      return value > test.value;
    case '>=':
      return value >= test.value;
    case 'range':
      return value >= test.min && value <= test.max;
  }
}

/** True if `value` equals the candidate or is a prefix of it (a trailing plural `s` is ignored). */
function prefixMatches(candidate: string, value: string): boolean {
  if (candidate.startsWith(value)) return true;
  return value.length > 1 && value.endsWith('s') && candidate.startsWith(value.slice(0, -1));
}

/** Does `word` appear in any folded name, tag or rules word, exactly, as a prefix, or as a substring? */
function vocabularyHas(index: SearchIndex, word: string): boolean {
  if (index.vocabularySet.has(word)) return true;
  const useSubstring = word.length >= MIN_SUBSTRING_LENGTH;
  return index.vocabulary.some((known) => known.startsWith(word) || (useSubstring && known.includes(word)));
}

function fuzzyWordScore(info: CardInfo, word: string): number {
  const limit = maxEdits(word.length);
  if (limit === 0) return 0;
  let best = 0;
  for (const token of info.nameTokens) {
    const distance = editDistance(word, token, limit);
    if (distance <= limit) best = Math.max(best, SCORE.fuzzyWord - distance * SCORE.fuzzyPenalty);
    if (best === 0 && word.length >= MIN_PREFIX_TYPO_LENGTH && token.length > word.length) {
      if (editDistance(word, token.slice(0, word.length), 1) <= 1) best = SCORE.fuzzyPrefix;
    }
  }
  return best;
}

/** Joined-word matches ("leesin" for "Lee Sin") need at least this many letters to avoid noise. */
const MIN_COMPACT_LENGTH = 5;

/** A word in the rules text counts less than any name or tag hit, so names always lead. */
function rulesWordScore(info: CardInfo, word: string): number {
  if (info.rulesPadded.includes(` ${word} `)) return SCORE.rulesExactWord;
  return info.rulesPadded.includes(` ${word}`) ? SCORE.rulesPrefixWord : 0;
}

/** Score one query word against name tokens, then tags, then rules text, then (if enabled) typos. */
function nameWordScore(info: CardInfo, word: string, fuzzy: boolean): number {
  let best = 0;
  for (const token of info.nameTokens) {
    if (token === word) return SCORE.exactWord;
    if (token.startsWith(word)) best = SCORE.prefixWord;
  }
  if (best) return best;
  if (word.length >= MIN_SUBSTRING_LENGTH && info.nameFolded.includes(word)) return SCORE.substringWord;
  if (word.length >= MIN_COMPACT_LENGTH && info.nameCompact.includes(word)) return SCORE.substringWord;
  if (info.tagTokens.some((tag) => tag === word || (word.length >= MIN_SUBSTRING_LENGTH && tag.startsWith(word)))) {
    return SCORE.tag;
  }
  const rulesScore = rulesWordScore(info, word);
  if (rulesScore) return rulesScore;
  return fuzzy ? fuzzyWordScore(info, word) : 0;
}

function wordMatcher(text: string, env: MatchEnv): Matcher {
  const words = tokenize(text);
  // Typo tolerance only kicks in for words nothing in the catalog matches, so exact hits never get diluted.
  const fuzzy = words.map((word) => !vocabularyHas(env.index, word));
  return (entry) => {
    let total = 0;
    for (let i = 0; i < words.length; i++) {
      const score = nameWordScore(entry.info, words[i] as string, fuzzy[i] as boolean);
      if (score === 0) return 0;
      total += score;
    }
    return total;
  };
}

/** Phrase must start at a word boundary of the haystack; the end may be a partial word. */
function hasPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack}`.includes(` ${phrase}`);
}

function phraseMatcher(text: string): Matcher {
  const phrase = foldText(text);
  return ({ info }) => {
    if (hasPhrase(info.nameFolded, phrase)) return SCORE.namePhrase;
    return hasPhrase(info.rulesFolded, phrase) ? SCORE.rulesPhrase : 0;
  };
}

function haystackMatcher(pick: (entry: Entry) => string, text: string, phrase: boolean, score: number): Matcher {
  const needles = phrase ? [foldText(text)] : tokenize(text);
  return (entry) => {
    const haystack = pick(entry);
    return needles.every((needle) => hasPhrase(haystack, needle)) ? score : 0;
  };
}

function enumCandidates(field: string, entry: Entry): { exact: string[]; prefix: string[] } {
  switch (field) {
    case 'set':
      return { exact: [entry.setId], prefix: entry.setLabelTokens };
    case 'type':
      return { exact: [], prefix: [entry.info.typeFolded] };
    case 'supertype':
      return { exact: [], prefix: [entry.info.supertypeFolded] };
    case 'domain':
      return { exact: [], prefix: entry.info.domainsFolded };
    case 'rarity':
      return { exact: [], prefix: [foldText(entry.printing.rarity)] };
    case 'keyword':
      return { exact: [], prefix: entry.info.keywordsFolded };
    default:
      return { exact: [], prefix: entry.variantNames };
  }
}

/** Set names need three letters before they count, so `set:o` does not match every label. */
const MIN_SET_LABEL_PREFIX = 3;

function enumMatcher(field: string, rawValues: string[], weight: number): Matcher {
  const values = rawValues.map(foldText).filter(Boolean);
  return (entry) => {
    const { exact, prefix } = enumCandidates(field, entry);
    const hit = values.some(
      (value) =>
        exact.includes(value) ||
        (field !== 'set' || value.length >= MIN_SET_LABEL_PREFIX) && prefix.some((candidate) => prefixMatches(candidate, value)),
    );
    return hit ? weight : 0;
  };
}

function numberMatcher(field: string, test: NumericTest): Matcher {
  return ({ card, printing }) => {
    const value = field === 'number' ? printing.collectorNumber : card[field as 'energy' | 'might' | 'power'];
    return evaluateNumeric(test, value) ? SCORE.filter : 0;
  };
}

function cardRefMatcher(clause: Extract<Clause, { kind: 'cardRef' }>, index: SearchIndex): Matcher {
  const { sets, prefix, number, suffix, total } = clause;
  const refMatches = (entry: Entry, markerOk: (marker: string) => boolean) =>
    (sets === null || sets.includes(entry.setId)) &&
    (sets !== null || total === null || entry.total === total) &&
    entry.refs.some((ref) => ref.number === number && ref.prefix === prefix && markerOk(ref.suffix));
  // Without an unmarked printing for this set and number (opp 42, pr 246), any marker will do.
  const anyMarker =
    clause.anyMarker || (suffix === '' && !index.entries.some((entry) => refMatches(entry, (marker) => marker === '')));
  return (entry) => {
    if (sets !== null && !sets.includes(entry.setId)) return 0;
    // The printed set size only narrows the match when no set was named.
    if (sets === null && total !== null && entry.total !== total) return 0;
    const hit = entry.refs.some(
      (ref) => ref.number === number && ref.prefix === prefix && (anyMarker || ref.suffix === suffix),
    );
    return hit ? SCORE.cardRef : 0;
  };
}

function ownedMatcher(test: OwnedTest, env: MatchEnv): Matcher {
  return ({ printing }) => {
    const totals = env.owned(printing.printingKey);
    if (test.type === 'foil') return totals.foil > 0 ? SCORE.filter : 0;
    if (test.type === 'nonfoil') return totals.normal > 0 ? SCORE.filter : 0;
    return evaluateNumeric(test.test, totals.total) ? SCORE.filter : 0;
  };
}

function userListMatcher(field: 'tag' | 'deck', values: string[], presence: 'any' | 'none' | null, env: MatchEnv): Matcher {
  const wanted = values.map(foldText).filter(Boolean);
  return ({ card }) => {
    const list = env.userList(field, card.cardKey);
    if (presence === 'any') return list.length > 0 ? SCORE.filter : 0;
    if (presence === 'none') return list.length === 0 ? SCORE.filter : 0;
    const hit = wanted.some((value) => list.some((item) => hasPhrase(item, value)));
    return hit ? SCORE.filter : 0;
  };
}

function groupMatcher(branches: Clause[][], env: MatchEnv): Matcher {
  const compiled = branches.map((branch) => branch.map((clause) => compileClause(clause, env)));
  return (entry) => {
    let best = 0;
    for (const matchers of compiled) {
      let total = 0;
      for (const matcher of matchers) {
        const score = matcher(entry);
        if (score === 0) {
          total = 0;
          break;
        }
        total += score;
      }
      best = Math.max(best, total);
    }
    return best;
  };
}

function positiveMatcher(clause: Clause, env: MatchEnv): Matcher {
  switch (clause.kind) {
    case 'word':
      return wordMatcher(clause.text, env);
    case 'phrase':
      return phraseMatcher(clause.text);
    case 'text':
      return textMatcher(clause);
    case 'enum':
      return enumMatcher(clause.field, clause.values, clause.weight ?? SCORE.filter);
    case 'number':
      return numberMatcher(clause.field, clause.test);
    case 'cardRef':
      return cardRefMatcher(clause, env.index);
    case 'printing': {
      const keys = new Set(clause.keys);
      return ({ printing }) => (keys.has(printing.printingKey) ? SCORE.cardRef : 0);
    }
    case 'owned':
      return ownedMatcher(clause.test, env);
    case 'user':
      return userListMatcher(clause.field, clause.values, clause.presence, env);
    case 'group':
      return groupMatcher(clause.branches, env);
  }
}

function textMatcher(clause: Extract<Clause, { kind: 'text' }>): Matcher {
  switch (clause.field) {
    case 'name':
      return haystackMatcher((entry) => entry.info.nameFolded, clause.text, clause.phrase, SCORE.namePhrase);
    case 'rules':
      return haystackMatcher((entry) => entry.info.rulesFolded, clause.text, clause.phrase, SCORE.rulesPhrase);
    case 'artist':
      return haystackMatcher((entry) => entry.artistFolded, clause.text, clause.phrase, SCORE.filter);
  }
}

/** Clauses whose result depends only on the card, so one evaluation serves every printing. */
function isCardLevel(clause: Clause): boolean {
  switch (clause.kind) {
    case 'word':
    case 'phrase':
    case 'user':
      return true;
    case 'text':
      return clause.field !== 'artist';
    case 'enum':
      return clause.field === 'type' || clause.field === 'domain' || clause.field === 'keyword';
    case 'number':
      return clause.field !== 'number';
    default:
      return false;
  }
}

/** Compile a clause into a matcher, adding per-card caching and negation. */
export function compileClause(clause: Clause, env: MatchEnv): Matcher {
  const base = positiveMatcher(clause, env);
  let matcher = base;
  if (isCardLevel(clause)) {
    const cache = new Map<string, number>();
    matcher = (entry) => {
      const key = entry.card.cardKey;
      let score = cache.get(key);
      if (score === undefined) {
        score = base(entry);
        cache.set(key, score);
      }
      return score;
    };
  }
  if (!clause.negated) return matcher;
  return (entry) => (matcher(entry) > 0 ? 0 : SCORE.filter);
}
