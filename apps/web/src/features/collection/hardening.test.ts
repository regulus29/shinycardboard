import { describe, expect, it } from 'vitest';
import type { OwnedEntry } from '@sc/core';
import { describeSuggestion, fieldSuggestions, mergeSuggestions } from '../search/omniboxModel';
import { countOwned } from './grouping';
import { alreadyImportedShare, buildImportPreview } from './importPreview';
import { numericWarnings } from './queryEdit';
import { summarizeCollection } from './stats';
import { FIXTURE_CATALOG, KEYS } from './testFixture';

const row = (printingKey: string, quantity: number): OwnedEntry => ({
  id: `${printingKey}|normal|NM`,
  printingKey,
  finish: 'normal',
  condition: 'NM',
  quantity,
  updatedAt: 1,
});

describe('numeric warnings, field suggestions and stats', () => {
  it('flags numeric fields compared with non numbers only', () => {
    expect(numericWarnings('energy>=abc')).toHaveLength(1);
    expect(numericWarnings('cost:2..4 might<2 power:..3 energy:1,x')).toHaveLength(1);
    expect(numericWarnings('energy>=3 name:abc vi')).toEqual([]);
  });

  it('completes bare words to field names and describes suggestions', () => {
    expect(fieldSuggestions('fury en')).toEqual([{ start: 5, text: 'energy:' }]);
    expect(fieldSuggestions('energy')).toEqual([]);
    expect(fieldSuggestions('energy>=3 ')).toEqual([]);
    expect(describeSuggestion({ start: 0, text: 'energy:' })).toBe('Field');
    expect(describeSuggestion({ start: 0, text: 'domain:fury' })).toBe('Domain filter');
    expect(mergeSuggestions('ra', [{ start: 0, text: 'rarity:' }, { start: 0, text: 'rare' }]).map((s) => s.text)).toEqual(['rarity:', 'rare']);
  });

  it('summarizes copies, percent owned and main sets only', () => {
    const catalog = { ...FIXTURE_CATALOG, sets: [...FIXTURE_CATALOG.sets, { setId: 'OPP', label: 'Organized Play Promotional Cards', count: 0 }] };
    const summary = summarizeCollection(catalog, countOwned([row(KEYS.vi, 2), row(KEYS.ember, 1)]));
    expect(summary).toMatchObject({ copies: 3, uniquePrintings: 2, uniqueCards: 2, mainSets: 2, mainSetsComplete: 1, percentOwned: 33.3 });
  });
});

describe('import preview hardening', () => {
  const csv = (rows: string[]) => ['printingKey,quantity,finish,condition', ...rows].join('\n');

  it('ignores a blank trailing row', () => {
    const preview = buildImportPreview(csv([`${KEYS.vi},2,normal,NM`, ',,,', '']), FIXTURE_CATALOG, 1);
    expect(preview.result.issues).toEqual([]);
    expect(preview.copies).toBe(2);
  });

  it('detects a file that matches what is already owned', () => {
    const existing = [row(KEYS.vi, 2), row(KEYS.tide, 1)];
    expect(alreadyImportedShare(existing, [row(KEYS.vi, 2), row(KEYS.tide, 1), row(KEYS.stone, 1)])).toBeCloseTo(2 / 3);
    expect(alreadyImportedShare(existing, [])).toBe(0);
  });
});
