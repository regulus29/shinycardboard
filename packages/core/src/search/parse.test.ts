import { describe, expect, it } from 'vitest';
import { parseNumberRef, parseSourceIdRef, parseSourceIdTotal } from './cardref';
import { editDistance, foldRules, foldText, maxEdits } from './fold';
import { MAX_QUERY_LENGTH, parseNumericTest, parseQuery } from './parse';
import type { Clause } from './types';

const SETS = ['OGN', 'OGS', 'SFD', 'UNL', 'VEN', 'OPP', 'PR', 'JDG'];
const clauses = (query: string, knownSets: string[] = SETS): Clause[] => parseQuery(query, { knownSets }).clauses;

describe('set plus number forms', () => {
  it.each([
    ['ogn 42', 'ogn', 42, ''],
    ['OGN-042', 'ogn', 42, ''],
    ['ogn042', 'ogn', 42, ''],
    ['unl 29a', 'unl', 29, 'a'],
    ['ogn #42', 'ogn', 42, ''],
    ['ogn#42', 'ogn', 42, ''],
    ['unl-229*', 'unl', 229, '*'],
    ['UNL 029A', 'unl', 29, 'a'],
  ])('%s', (query, set, number, suffix) => {
    expect(clauses(query)).toMatchObject([{ kind: 'cardRef', sets: [set], number, suffix, prefix: '' }]);
  });

  it('handles lettered numbers and bare numbers', () => {
    expect(clauses('ven r04')).toMatchObject([{ kind: 'cardRef', sets: ['ven'], prefix: 'r', number: 4 }]);
    expect(clauses('ven-sp4')).toMatchObject([{ kind: 'cardRef', sets: ['ven'], prefix: 'sp', number: 4 }]);
    expect(clauses('42')).toMatchObject([
      { kind: 'group', branches: [[{ kind: 'cardRef', sets: null, number: 42 }], [{ kind: 'word', text: '42' }]] },
    ]);
    expect(clauses('42a')).toMatchObject([{ kind: 'cardRef', sets: null, number: 42, suffix: 'a' }]);
    expect(clauses('042/298')).toMatchObject([{ kind: 'cardRef', sets: null, number: 42, total: 298 }]);
    expect(clauses('ogn/042')).toMatchObject([{ kind: 'cardRef', sets: ['ogn'], number: 42 }]);
    expect(clauses('ogn 042/298')).toMatchObject([{ kind: 'cardRef', sets: ['ogn'], number: 42, total: 298 }]);
    expect(clauses('fury 42')).toMatchObject([{ kind: 'enum' }, { kind: 'group' }]);
  });

  it('does not treat unknown prefixes as sets when sets are known', () => {
    expect(clauses('poro 3')).toMatchObject([{ kind: 'word', text: 'poro' }, { kind: 'group' }]);
  });
});

describe('bare words', () => {
  it('turns domain, type and rarity words into filters', () => {
    expect(clauses('fury units')).toMatchObject([
      { kind: 'enum', field: 'domain', values: ['fury'] },
      { kind: 'enum', field: 'type', values: ['unit'] },
    ]);
    expect(clauses('epic')).toMatchObject([{ kind: 'enum', field: 'rarity' }]);
  });

  it('makes keyword words match the keyword or the name', () => {
    expect(clauses('tank')).toMatchObject([{ kind: 'group', branches: [[{ field: 'keyword' }], [{ kind: 'word', text: 'tank' }]] }]);
  });

  it('keeps hyphens and apostrophes inside names', () => {
    expect(clauses("kha'zix tomb-raider")).toMatchObject([
      { kind: 'word', text: 'khazix' },
      { kind: 'word', text: 'tomb raider' },
    ]);
  });

  it('treats quoted text as a phrase', () => {
    expect(clauses('"draw 1"')).toMatchObject([{ kind: 'phrase', text: 'draw 1', negated: false }]);
    expect(clauses('-"draw 1"')).toMatchObject([{ kind: 'phrase', negated: true }]);
  });
});

describe('field filters', () => {
  it('parses numeric comparisons and ranges', () => {
    expect(clauses('energy>=3')).toMatchObject([{ kind: 'number', field: 'energy', test: { op: '>=', value: 3 } }]);
    expect(clauses('cost:2..4')).toMatchObject([{ field: 'energy', test: { op: 'range', min: 2, max: 4 } }]);
    expect(clauses('might<2')).toMatchObject([{ field: 'might', test: { op: '<', value: 2 } }]);
    expect(clauses('might:>=2')).toMatchObject([{ test: { op: '>=', value: 2 } }]);
    expect(clauses('cost:..2')).toMatchObject([{ test: { op: '<=', value: 2 } }]);
    expect(clauses('cost:4..2')).toMatchObject([{ test: { op: 'range', min: 2, max: 4 } }]);
    expect(clauses('power!=1')).toMatchObject([{ field: 'power', test: { op: '!=', value: 1 } }]);
    expect(parseNumericTest(':', 'x')).toBeNull();
  });

  it('parses enum alternatives, aliases and negation', () => {
    expect(clauses('domain:fury,Calm')).toMatchObject([{ kind: 'enum', field: 'domain', values: ['fury', 'calm'] }]);
    expect(clauses('-d:fury')).toMatchObject([{ field: 'domain', negated: true }]);
    expect(clauses('domain!=fury')).toMatchObject([{ field: 'domain', negated: true }]);
    expect(clauses('variant:alt')).toMatchObject([{ field: 'variant', values: ['alternate art'] }]);
  });

  it('parses owned, tag, deck and text fields', () => {
    expect(clauses('owned:yes')).toMatchObject([{ kind: 'owned', test: { type: 'count', test: { op: '>=', value: 1 } } }]);
    expect(clauses('owned:>2')).toMatchObject([{ test: { type: 'count', test: { op: '>', value: 2 } } }]);
    expect(clauses('owned:foil')).toMatchObject([{ test: { type: 'foil' } }]);
    expect(clauses('tag:"aggro package"')).toMatchObject([{ kind: 'user', field: 'tag', values: ['aggro package'] }]);
    expect(clauses('tag:none')).toMatchObject([{ presence: 'none' }]);
    expect(clauses('deck:any')).toMatchObject([{ field: 'deck', presence: 'any' }]);
    expect(clauses('text:"draw 1"')).toMatchObject([{ kind: 'text', field: 'rules', phrase: true }]);
    expect(clauses('artist:junhuan')).toMatchObject([{ kind: 'text', field: 'artist', phrase: false }]);
  });
});

describe('OR and parentheses', () => {
  it('builds a group for OR and the pipe', () => {
    expect(clauses('fury OR calm')).toMatchObject([{ kind: 'group', branches: [[{ field: 'domain' }], [{ field: 'domain' }]] }]);
    expect(clauses('fury | calm')[0]).toMatchObject({ kind: 'group' });
    expect(clauses('fury|calm')[0]).toMatchObject({ kind: 'group' });
  });

  it('flattens plain parentheses and keeps negated ones', () => {
    expect(clauses('(fury unit)')).toHaveLength(2);
    expect(clauses('-(fury OR calm)')).toMatchObject([{ kind: 'group', negated: true }]);
    expect(clauses('rune (fury OR calm)')).toHaveLength(2);
  });

  it('lets AND bind tighter than OR', () => {
    expect(clauses('fury unit OR calm spell')).toMatchObject([{ kind: 'group', branches: [{ length: 2 }, { length: 2 }] }]);
  });
});

describe('robustness', () => {
  it('warns instead of throwing on malformed input', () => {
    const inputs = ['"open', 'cost:', 'cost:abc', 'foo:bar', ')', '(', 'OR', 'a OR', 'OR a', '-', '--x', '((((((((((x))))))))))', 'owned:maybe', '\u0000\u202e'];
    for (const input of inputs) {
      expect(() => parseQuery(input), input).not.toThrow();
    }
    expect(parseQuery('cost:abc').warnings).toHaveLength(1);
    expect(parseQuery('foo:bar').warnings[0]?.message).toContain('Unknown field');
    expect(parseQuery('foo:bar').clauses).toMatchObject([{ kind: 'word', text: 'foo bar' }]);
    expect(parseQuery('"open').warnings[0]?.message).toContain('quote');
    expect(parseQuery('a OR').warnings[0]?.message).toContain('right');
    expect(parseQuery('((((((((((x))))))))))').clauses).toMatchObject([{ kind: 'word', text: 'x' }]);
  });

  it('survives random token soup and non-string input', () => {
    const pieces = ['(', ')', '"', '-', 'OR', '|', ':', '>=', '..', 'cost', 'tag', 'ogn', '42', '*', '#', 'fury', ' ', 'a'];
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let i = 0; i < 500; i++) {
      const length = 1 + (next() % 12);
      const query = Array.from({ length }, () => pieces[next() % pieces.length]).join('');
      expect(() => parseQuery(query), query).not.toThrow();
    }
    expect(parseQuery(undefined as unknown as string).clauses).toEqual([]);
  });

  it('truncates very long queries with a warning', () => {
    const result = parseQuery('a '.repeat(MAX_QUERY_LENGTH));
    expect(result.warnings[0]?.message).toContain('truncated');
  });

  it('keeps the raw query', () => {
    expect(parseQuery('  Fury  ').raw).toBe('  Fury  ');
  });
});

describe('text folding and typo distance', () => {
  it('folds accents, apostrophes and punctuation', () => {
    expect(foldText("Kha'Zix - Voidreaver!")).toBe('khazix voidreaver');
    expect(foldText('\u00c9clair')).toBe('eclair');
    expect(foldRules('+1 :rb_might: and :rb_energy_2::rb_rune_fury:')).toBe('1 might and 2 energy fury rune');
  });

  it('computes bounded edit distance with transpositions', () => {
    expect(editDistance('bewitchng', 'bewitching', 2)).toBe(1);
    expect(editDistance('spirit', 'sprit', 2)).toBe(1);
    expect(editDistance('ahri', 'ahir', 2)).toBe(1);
    expect(editDistance('abc', 'xyz', 1)).toBe(2);
    expect(editDistance('a', 'abcdef', 2)).toBe(3);
    expect(maxEdits(3)).toBe(0);
    expect(maxEdits(5)).toBe(1);
    expect(maxEdits(9)).toBe(2);
  });
});

describe('source id parsing', () => {
  it('reads number, marker and printed set size from source ids', () => {
    expect(parseSourceIdRef('unl-029a-219')).toEqual({ prefix: '', number: 29, suffix: 'a', total: 219 });
    expect(parseSourceIdRef('unl-229*-219')).toEqual({ prefix: '', number: 229, suffix: '*', total: 219 });
    expect(parseSourceIdRef('ven-sp4-006')).toEqual({ prefix: 'sp', number: 4, suffix: '', total: 6 });
    expect(parseSourceIdRef('ven-r04')).toEqual({ prefix: 'r', number: 4, suffix: '', total: null });
    expect(parseSourceIdTotal('opp-001-298')).toBe(298);
    expect(parseSourceIdTotal('sfd-t03')).toBeNull();
    expect(parseSourceIdRef('nonsense')).toBeNull();
  });

  it('accepts x or * as the marker in queries', () => {
    expect(parseNumberRef('301x')).toMatchObject({ number: 301, suffix: '*' });
    expect(parseNumberRef('301*')).toMatchObject({ number: 301, suffix: '*' });
    expect(parseNumberRef('29a')).toMatchObject({ number: 29, suffix: 'a' });
  });
});

describe('lowercase or', () => {
  it('joins only facet and field words, and chains', () => {
    expect(clauses('fury or calm')).toMatchObject([{ kind: 'group', branches: [[{ field: 'domain' }], [{ field: 'domain' }]] }]);
    expect(clauses('fury or calm unit')).toMatchObject([{ kind: 'group' }, { kind: 'enum', field: 'type' }]);
    expect(clauses('fury or calm or mind')).toMatchObject([{ kind: 'group', branches: [{ length: 1 }, { length: 1 }, { length: 1 }] }]);
    expect(clauses('type:rune or domain:fury')).toMatchObject([{ kind: 'group' }]);
  });

  it('leaves names containing or alone', () => {
    for (const query of ['rise or fall', 'or fury', 'fury or', 'fury or kings', '"fury or calm"']) {
      const parsed = clauses(query);
      expect(parsed.some((c) => c.kind === 'group' && c.source === 'or'), query).toBe(false);
    }
    expect(clauses('rise or fall')).toMatchObject([{ kind: 'word', text: 'rise' }, { kind: 'word', text: 'or' }, { kind: 'word', text: 'fall' }]);
  });
});
