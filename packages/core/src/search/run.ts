import type { Catalog } from '../types';
import { tokenize } from './fold';
import { getIndex, type Entry } from './index-build';
import { compileClause, MatchEnv } from './match';
import { parseQuery } from './parse';
import { nameBonus, sortScored, type Scored } from './rank';
import type { Clause, ParsedQuery, ParseWarning, SearchContext, SearchHit, SearchOptions } from './types';

function setValues(clauses: Clause[]): { value: string; source: string }[] {
  return clauses.flatMap((clause) => {
    if (clause.kind === 'group') return setValues(clause.branches.flat());
    if (clause.kind !== 'enum' || clause.field !== 'set') return [];
    return clause.values.map((value) => ({ value, source: clause.source }));
  });
}

/** Warn about `set:` values that match no set code or set name word, since they silently return nothing. */
function unknownSetWarnings(clauses: Clause[], catalog: Catalog): ParseWarning[] {
  const known = (value: string) =>
    catalog.sets.some(
      (set) => set.setId.toLowerCase() === value || tokenize(set.label).some((word) => word.startsWith(value)),
    );
  return setValues(clauses)
    .filter(({ value }) => !known(value))
    .map(({ value, source }) => ({ token: source, message: `Unknown set "${value}"` }));
}

function scoreEntries(parsed: ParsedQuery, entries: Entry[], env: MatchEnv): Scored[] {
  const matchers = parsed.clauses.map((clause) => compileClause(clause, env));
  const bonus = nameBonus(parsed.clauses);
  const scored: Scored[] = [];
  for (const entry of entries) {
    let score = 0;
    let matched = true;
    for (const matcher of matchers) {
      const clauseScore = matcher(entry);
      if (clauseScore === 0) {
        matched = false;
        break;
      }
      score += clauseScore;
    }
    if (matched) scored.push({ entry, score: score + bonus(entry) });
  }
  return scored;
}

/**
 * Run a query against the catalog. Accepts query text or an already parsed query.
 * Results are ordered by relevance unless a sort is given; ties break by set order then number.
 */
export function runSearch(
  input: string | ParsedQuery,
  catalog: Catalog,
  ctx: SearchContext,
  opts: SearchOptions = {},
): { hits: SearchHit[]; warnings: ParseWarning[] } {
  const index = getIndex(catalog);
  const parsed = typeof input === 'string' ? parseQuery(input, { knownSets: index.setIds, phrases: index.phrases, printingLookup: index.printingLookup }) : input;
  const env = new MatchEnv(index, ctx);
  const scored = scoreEntries(parsed, index.entries, env);
  const ordered = sortScored(scored, opts.sort ?? 'relevance', opts.descending ?? false, env);
  const limited = opts.limit === undefined ? ordered : ordered.slice(0, Math.max(0, opts.limit));
  return {
    hits: limited.map(({ entry, score }) => ({ printing: entry.printing, card: entry.card, score })),
    warnings: [...parsed.warnings, ...unknownSetWarnings(parsed.clauses, catalog)],
  };
}
