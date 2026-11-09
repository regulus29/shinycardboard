import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../catalog/build';
import { loadFixtureRaw } from '../catalog/test-data';
import { lastTokenStart, suggest, SUGGESTION_LIMIT } from './suggest';
import type { SearchContext } from './types';

const catalog = buildCatalog(loadFixtureRaw(), 'fixture');
const ctx: SearchContext = {
  owned: [],
  tagsByCard: { 'red-brambleback': ['aggro package', 'burn'] },
  decksByCard: { 'red-brambleback': ['Fury Ramp'] },
};

describe('suggest', () => {
  it('completes field names, values and sets as full queries', () => {
    expect(suggest('do', catalog, ctx)).toContain('domain:');
    expect(suggest('fury ty', catalog, ctx)).toContain('fury type:');
    expect(suggest('type:ru', catalog, ctx)).toEqual(['type:rune']);
    expect(suggest('domain:f', catalog, ctx)).toEqual(['domain:fury']);
    expect(suggest('set:u', catalog, ctx)).toEqual(['set:unl']);
    expect(suggest('fu', catalog, ctx)).toContain('fury');
  });

  it('suggests user tags and decks, quoting values with spaces', () => {
    expect(suggest('tag:ag', catalog, ctx)).toEqual(['tag:"aggro package"']);
    expect(suggest('bu', catalog, ctx)).toContain('tag:burn');
    expect(suggest('deck:fu', catalog, ctx)).toEqual(['deck:"Fury Ramp"']);
  });

  it('suggests card names and keeps negation', () => {
    expect(suggest('bewitc', catalog, ctx)).toEqual(['Bewitching Spirit']);
    expect(suggest('-fu', catalog, ctx)).toContain('-fury');
    expect(suggest('-type:u', catalog, ctx)).toEqual(['-type:unit']);
  });

  it('ranks names that start with the typed text first, not alphabetically', () => {
    const result = suggest('vi', catalog, ctx);
    expect(result.slice(0, 2)).toEqual(['Vi', 'Viktor']);
    expect(suggest('red bramb', catalog, ctx)).toEqual(['Red Brambleback']);
    expect(suggest('fury red bramb', catalog, ctx)).toEqual(['fury Red Brambleback']);
  });

  it('suggests set titles, keywords, variants and card numbers', () => {
    expect(suggest('unle', catalog, ctx)).toContain('set:unl');
    expect(suggest('orig', catalog, ctx)).toContain('set:ogn');
    expect(suggest('tan', catalog, ctx)).toContain('keyword:tank');
    expect(suggest('meta', catalog, ctx)).toContain('variant:metal');
    expect(suggest('alt', catalog, ctx)).toContain('variant:alternate-art');
    const numbers = suggest('ogn 4', catalog, ctx);
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.every((text) => /^ogn 4\d*$/.test(text))).toBe(true);
    expect(suggest('unleashed 2', catalog, ctx).every((text) => text.startsWith('unleashed 2'))).toBe(true);
  });

  it('returns nothing for empty, unknown or exhausted input', () => {
    expect(suggest('', catalog, ctx)).toEqual([]);
    expect(suggest('fury ', catalog, ctx)).toEqual([]);
    expect(suggest('zzzzqq', catalog, ctx)).toEqual([]);
    expect(suggest('bogus:x', catalog, ctx)).toEqual([]);
    expect(suggest('type:unit', catalog, ctx)).toEqual([]);
  });

  it('caps the number of suggestions', () => {
    expect(suggest('a', catalog, ctx).length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
  });

  it('finds the start of the token being typed, honouring quotes', () => {
    expect(lastTokenStart('fury ty')).toBe(5);
    expect(lastTokenStart('(fury OR ca')).toBe(9);
    expect(lastTokenStart('tag:"aggro pa')).toBe(0);
    expect(lastTokenStart('tag:"aggro package" ')).toBe(20);
  });
});

describe('suggest hints and name completion', () => {
  it('completes multi-word names from the first letters of the next word', () => {
    expect(suggest('jinx r', catalog, ctx)[0]).toBe('Jinx - Rebel');
    expect(suggest('fury jinx r', catalog, ctx)[0]).toBe('fury Jinx - Rebel');
  });

  it('hints numeric, tag, deck and artist fields', () => {
    expect(suggest('cost', catalog, ctx)).toContain('cost:');
    expect(suggest('cost:', catalog, ctx)).toEqual(expect.arrayContaining(['cost:2', 'cost>=3']));
    expect(suggest('cost:2', catalog, ctx)).toEqual(['cost:2..4']);
    expect(suggest('tag:', catalog, ctx)).toEqual(expect.arrayContaining(['tag:"aggro package"', 'tag:none', 'tag:any']));
    expect(suggest('deck:', catalog, ctx)).toEqual(expect.arrayContaining(['deck:"Fury Ramp"', 'deck:none']));
    expect(suggest('artist:ju', catalog, ctx)).toEqual(['artist:JunHuan']);
    expect(suggest('artist', catalog, ctx)).toContain('artist:');
  });

  it('answers a single typed letter with names, keywords and fields', () => {
    const result = suggest('a', catalog, ctx);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
    expect(result.some((text) => text.startsWith('keyword:'))).toBe(true);
    expect(result[0]?.toLowerCase().startsWith('a')).toBe(true);
  });
});
