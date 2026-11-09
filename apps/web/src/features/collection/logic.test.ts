import { describe, expect, it } from 'vitest';
import { runSearch, type OwnedEntry, type SearchContext, type SearchHit } from '@sc/core';
import { applyScope, countOwned, flattenGroups, groupHits } from './grouping';
import { readParams, writeParams, listContextSearch } from './params';
import { clearField, fieldValues, toggleFieldValue, tokenizeQuery } from './queryEdit';
import { computeSetProgress, overallProgress, setLink } from './sets';
import { buildItems, buildOffsets, gridColumns, itemIndexForHit, tileWidth, visibleRange } from './windowing';
import { nextIndex } from './ResultsList';
import { FIXTURE_CATALOG, KEYS } from './testFixture';

const row = (printingKey: string, quantity: number, finish: OwnedEntry['finish'] = 'normal', condition: OwnedEntry['condition'] = 'NM'): OwnedEntry => ({
  id: `${printingKey}|${finish}|${condition}`,
  printingKey,
  finish,
  condition,
  quantity,
  updatedAt: 1,
});

const EMPTY_CTX: SearchContext = { owned: [], tagsByCard: {}, decksByCard: {} };
const allHits = (): SearchHit[] => runSearch('', FIXTURE_CATALOG, EMPTY_CTX, { sort: 'name' }).hits;

describe('query editing', () => {
  it('appends, merges and removes field values so chips and text agree', () => {
    let q = toggleFieldValue('', 'domain', 'fury');
    expect(q).toBe('domain:fury');
    q = toggleFieldValue(q, 'domain', 'calm');
    expect(q).toBe('domain:fury,calm');
    expect(fieldValues(q, 'domain')).toEqual(['fury', 'calm']);
    q = toggleFieldValue(q, 'domain', 'fury');
    expect(q).toBe('domain:calm');
    expect(toggleFieldValue(q, 'domain', 'calm')).toBe('');
  });

  it('keeps unrelated terms and understands aliases', () => {
    expect(toggleFieldValue('vi energy>=3', 'type', 'unit')).toBe('vi energy>=3 type:unit');
    expect(fieldValues('t:unit d:fury', 'type')).toEqual(['unit']);
    expect(toggleFieldValue('t:unit vi', 'type', 'spell')).toBe('type:unit,spell vi');
  });

  it('wraps a top-level OR before appending so the filter applies to both branches', () => {
    expect(toggleFieldValue('fury OR calm', 'type', 'unit')).toBe('(fury OR calm) type:unit');
  });

  it('tokenizes around quotes and parentheses and clears a field', () => {
    expect(tokenizeQuery('tag:"aggro pack" (a OR b) c').map((t) => t.text)).toEqual(['tag:"aggro pack"', '(a OR b)', 'c']);
    expect(fieldValues('tag:"aggro pack"', 'tag')).toEqual(['aggro pack']);
    expect(clearField('vi domain:fury domain:calm', 'domain')).toBe('vi');
  });
});

describe('url params', () => {
  it('round trips and drops defaults', () => {
    const params = new URLSearchParams('q=fury&scope=owned&sort=name&dir=desc&group=set&view=table');
    expect(readParams(params)).toEqual({ query: 'fury', scope: 'owned', sort: 'name', descending: true, group: 'set', view: 'table' });
    expect(writeParams(new URLSearchParams('q=x&scope=owned'), { scope: 'all', query: '' }).toString()).toBe('');
    expect(listContextSearch(new URLSearchParams('q=x&junk=1'))).toBe('?q=x');
  });

  it('ignores invalid values', () => {
    expect(readParams(new URLSearchParams('scope=bogus&sort=nope&group=x&view=cube')).scope).toBe('all');
  });
});

describe('scope and grouping', () => {
  const counts = countOwned([row(KEYS.vi, 2), row(KEYS.vi, 1, 'foil'), row(KEYS.tide, 1), { ...row(KEYS.stone, 4), deleted: true }]);

  it('counts copies across finishes and ignores tombstones', () => {
    expect(counts.get(KEYS.vi)).toMatchObject({ total: 3, foil: 1, target: { finish: 'normal', condition: 'NM' } });
    expect(counts.has(KEYS.stone)).toBe(false);
  });

  it('filters by scope', () => {
    const hits = allHits();
    expect(applyScope(hits, 'owned', counts).map((h) => h.printing.printingKey).sort()).toEqual([KEYS.tide, KEYS.vi].sort());
    expect(applyScope(hits, 'missing', counts)).toHaveLength(hits.length - 2);
    expect(applyScope(hits, 'all', counts)).toBe(hits);
  });

  it('groups by set in catalog order, keeping hit order inside groups', () => {
    const groups = groupHits(allHits(), 'set', FIXTURE_CATALOG);
    expect(groups.map((g) => g.key)).toEqual(['OGN', 'UNL']);
    expect(groups[0]?.label).toBe('Origins');
    expect(groups[0]?.hits.map((h) => h.card.name)).toEqual(['Ember Caller', 'Vi Brawler', 'Vi Brawler']);
  });

  it('groups by domain, type and rarity in canonical order', () => {
    expect(groupHits(allHits(), 'domain', FIXTURE_CATALOG).map((g) => g.key)).toEqual(['Fury', 'Calm', 'Body']);
    expect(groupHits(allHits(), 'type', FIXTURE_CATALOG).map((g) => g.key)).toEqual(['Unit', 'Spell', 'Gear']);
    expect(groupHits(allHits(), 'rarity', FIXTURE_CATALOG).map((g) => g.key)).toEqual(['common', 'uncommon', 'rare', 'epic']);
  });

  it('returns a single unlabeled group, or none, when not grouping', () => {
    const groups = groupHits(allHits(), 'none', FIXTURE_CATALOG);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('');
    expect(flattenGroups(groups)).toHaveLength(6);
    expect(groupHits([], 'none', FIXTURE_CATALOG)).toEqual([]);
  });

  it('sorts by owned through the search engine', () => {
    const ctx: SearchContext = { ...EMPTY_CTX, owned: [row(KEYS.tide, 5), row(KEYS.vi, 1)] };
    const hits = runSearch('', FIXTURE_CATALOG, ctx, { sort: 'owned', descending: true }).hits;
    expect(hits[0]?.printing.printingKey).toBe(KEYS.tide);
  });
});

describe('windowing math', () => {
  it('computes columns and tile width', () => {
    expect(gridColumns(0, 150, 16)).toBe(1);
    expect(gridColumns(343, 148, 16)).toBe(2);
    expect(gridColumns(1000, 148, 16)).toBe(6);
    expect(tileWidth(1000, 6, 16)).toBeCloseTo(153.33, 1);
  });

  it('lays out headers and rows with running starts', () => {
    const groups = groupHits(allHits(), 'set', FIXTURE_CATALOG);
    const items = buildItems(groups, { columns: 2, rowStride: 100, headerHeight: 40 });
    expect(items.map((i) => i.kind)).toEqual(['header', 'row', 'row', 'header', 'row', 'row']);
    expect(items.filter((i) => i.kind === 'row').map((i) => (i.kind === 'row' ? i.start : -1))).toEqual([0, 2, 3, 5]);
    expect(itemIndexForHit(items, 3)).toBe(4);
    expect(itemIndexForHit(items, 99)).toBe(-1);
    expect(buildOffsets(items.map((i) => i.height))).toEqual([0, 40, 140, 240, 280, 380, 480]);
  });

  it('renders only items near the viewport', () => {
    const offsets = buildOffsets(Array.from({ length: 1000 }, () => 100));
    expect(visibleRange(offsets, 0, 500, 0)).toEqual({ start: 0, end: 5 });
    expect(visibleRange(offsets, 5000, 500, 200)).toEqual({ start: 48, end: 57 });
    expect(visibleRange(offsets, 99_900, 500, 0)).toEqual({ start: 999, end: 1000 });
    expect(visibleRange(offsets, -5000, 500, 0)).toEqual({ start: 0, end: 1 });
    expect(visibleRange([0], 0, 500, 0)).toEqual({ start: 0, end: 0 });
  });

  it('bounds keyboard moves to the result list', () => {
    expect(nextIndex('ArrowRight', 5, 4, 10)).toBe(6);
    expect(nextIndex('ArrowDown', 5, 4, 10)).toBe(9);
    expect(nextIndex('ArrowDown', 8, 4, 10)).toBe(9);
    expect(nextIndex('ArrowLeft', 0, 4, 10)).toBe(0);
    expect(nextIndex('End', 0, 4, 10)).toBe(9);
    expect(nextIndex('PageUp', 3, 1, 10)).toBe(0);
  });
});

describe('set completion math', () => {
  const owned = new Set<string>([KEYS.vi, KEYS.viAlt, KEYS.ember]);

  it('counts standard printings only by default', () => {
    const [ogn, unl] = computeSetProgress(FIXTURE_CATALOG, owned, true);
    expect(ogn).toMatchObject({ setId: 'OGN', owned: 2, total: 2, complete: true });
    expect(unl).toMatchObject({ setId: 'UNL', owned: 0, total: 2, complete: false });
  });

  it('counts every variant when asked and reports a per-variant breakdown', () => {
    const [ogn] = computeSetProgress(FIXTURE_CATALOG, owned, false);
    expect(ogn).toMatchObject({ owned: 3, total: 3, complete: true });
    expect(ogn?.variants).toEqual([
      { variant: 'standard', owned: 2, total: 2 },
      { variant: 'alternate-art', owned: 1, total: 1 },
    ]);
    const partial = computeSetProgress(FIXTURE_CATALOG, new Set([KEYS.vi]), false);
    expect(partial[0]?.complete).toBe(false);
    expect(overallProgress(partial)).toBeCloseTo(1 / 6);
  });

  it('builds links into the collection with scope presets', () => {
    expect(setLink('OGN', null, true)).toBe('/collection?q=set%3AOGN');
    expect(setLink('OGN', 'owned', true)).toBe('/collection?q=set%3AOGN&scope=owned');
    expect(setLink('OGN', 'missing', true)).toBe('/collection?q=set%3AOGN%20variant%3Astandard&scope=missing');
    expect(setLink('OGN', 'missing', false)).toBe('/collection?q=set%3AOGN&scope=missing');
  });
});
