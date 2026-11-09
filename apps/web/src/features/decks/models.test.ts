import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deckStats, defaultRules, legalCards, type Deck } from '@sc/core';
import { createAutosaver } from './autosave';
import { AUTOSAVE_DELAY_MS, ENERGY_BUCKET_MAX } from './constants';
import { acquireList, curveBars, curveSummary, provenanceEntries, shoppingList, validity } from './insightsModel';
import { buildImportPreview } from './importModel';
import { addTagTo, fromStored, toPatch } from './deckPatch';
import { filterLegends, legendOptions, matchesDeckSearch, sortSummaries, summarizeDeck } from './listModel';
import { NO_FILTERS, buildPool, hasActiveFilters } from './poolModel';
import { makeTestCatalog, ownedRow, viCollection } from './testCatalog';
import { ownedByCard } from '@sc/core';

const catalog = makeTestCatalog();

function deck(over: Partial<Deck> = {}): Deck {
  return { id: 'd1', name: 'Test', updatedAt: 1, legendKey: 'vi-legend', main: [], runes: [], battlefields: [], sideboard: [], ...over };
}

describe('autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces rapid edits into one save of the latest value', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutosaver<number>(save, AUTOSAVE_DELAY_MS);
    saver.schedule(1);
    saver.schedule(2);
    saver.schedule(3);
    expect(save).not.toHaveBeenCalled();
    expect(saver.status()).toBe('pending');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
    expect(saver.status()).toBe('saved');
  });

  it('flush saves immediately and leaves nothing pending', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutosaver<string>(save, AUTOSAVE_DELAY_MS);
    saver.schedule('a');
    await saver.flush();
    expect(save).toHaveBeenCalledWith('a');
    expect(saver.hasPending()).toBe(false);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('serializes a save requested while another is in flight', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const save = vi.fn(async (value: string) => {
      order.push(`start ${value}`);
      if (value === 'a') await new Promise<void>((resolve) => (release = resolve));
      order.push(`end ${value}`);
    });
    const saver = createAutosaver<string>(save, AUTOSAVE_DELAY_MS);
    saver.schedule('a');
    void saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    saver.schedule('b');
    const done = saver.flush();
    release();
    await done;
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('reports an error and retries the failed value on the next flush', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const saver = createAutosaver<string>(save, AUTOSAVE_DELAY_MS);
    saver.schedule('x');
    await saver.flush();
    expect(saver.status()).toBe('error');
    expect(saver.hasPending()).toBe(true);
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.status()).toBe('saved');
  });

  it('cancel drops the queued value', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutosaver<string>(save, AUTOSAVE_DELAY_MS);
    saver.schedule('x');
    saver.cancel();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('insights model', () => {
  it('buckets the curve and caps the last bar', () => {
    const stats = deckStats(deck({ main: [{ cardKey: 'fury-unit-1', count: 2 }, { cardKey: 'fury-unit-6', count: 3 }] }), catalog);
    const bars = curveBars(stats);
    expect(bars).toHaveLength(ENERGY_BUCKET_MAX + 1);
    expect(bars[1]?.count).toBe(2);
    expect(bars[ENERGY_BUCKET_MAX]?.count).toBe(3);
    expect(bars[ENERGY_BUCKET_MAX]?.label).toBe(`${ENERGY_BUCKET_MAX}+`);
    expect(curveSummary(bars, stats.averageEnergy)).toContain('2 at energy 1');
    expect(curveSummary(curveBars(deckStats(deck(), catalog)), 0)).toMatch(/no main deck/i);
  });

  it('summarizes validity tone', () => {
    expect(validity([]).tone).toBe('success');
    expect(validity([{ severity: 'warning', code: 'sideboard-size', message: 'w' }]).tone).toBe('warning');
    expect(validity([{ severity: 'error', code: 'main-size', message: 'e' }]).label).toBe('1 error');
  });

  it('formats shopping lists', () => {
    expect(shoppingList([{ cardKey: 'vi-champ', needed: 3, owned: 1, missing: 2 }], catalog)).toBe('2 Vi, Destructive');
    expect(acquireList([{ cardKey: 'vi-champ', count: 0, reason: '', section: 'main' }, { cardKey: 'fury-unit-1', count: 1, reason: '', section: 'main' }], catalog)).toBe('1 Fury Unit 1');
  });

  it('lists provenance with unverified rules first', () => {
    const entries = provenanceEntries();
    expect(entries.length).toBe(Object.keys(defaultRules.provenance).length);
    expect(entries[0]?.status).toBe('unverified');
    expect(entries.at(-1)?.status).toBe('confirmed');
  });
});

describe('import preview', () => {
  const text = ['Legend', '1 Vi, Piltover Enforcer', 'Champion', '1 Vi, Destructive', 'Main Deck', '3 Fury Unit 1', '2 Not A Real Card', 'Runes', '12 Fury Rune'].join('\n');

  it('matches known cards, lists unmatched lines and names the champion', () => {
    const preview = buildImportPreview(text, catalog, 1);
    expect(preview.legendName).toBe('Vi, Piltover Enforcer');
    expect(preview.championName).toBe('Vi, Destructive');
    expect(preview.matched.some((m) => m.cardKey === 'fury-unit-1' && m.count === 3)).toBe(true);
    expect(preview.sectionCounts.runes).toBe(12);
    expect(preview.unmatched.join(' ')).toMatch(/not a real card/i);
    expect(preview.empty).toBe(false);
  });

  it('flags empty text', () => {
    expect(buildImportPreview('   ', catalog, 1).empty).toBe(true);
  });
});

describe('deck patch', () => {
  it('round trips cleared optional fields through empty strings', () => {
    const patch = toPatch(deck());
    expect(patch.chosenChampionKey).toBe('');
    expect(fromStored({ ...deck(), chosenChampionKey: '' as string }).chosenChampionKey).toBeUndefined();
  });

  it('adds tags once, case insensitively, within limits', () => {
    expect(addTagTo([], ' Aggro ', 5, 32)).toEqual(['Aggro']);
    expect(addTagTo(['Aggro'], 'aggro', 5, 32)).toEqual(['Aggro']);
    expect(addTagTo(['a'], 'b', 1, 32)).toEqual(['a']);
    expect(addTagTo([], 'abcdef', 5, 3)).toEqual(['abc']);
  });
});

describe('list model', () => {
  it('summarizes, searches and sorts decks', () => {
    const a = summarizeDeck(deck({ id: 'a', name: 'Zed', updatedAt: 5, tags: ['burn'] }), catalog);
    const b = summarizeDeck(
      deck({ id: 'b', name: 'Alpha', updatedAt: 9, main: [{ cardKey: 'fury-unit-1', count: 3 }] }),
      catalog,
    );
    expect(matchesDeckSearch(a, 'BURN')).toBe(true);
    expect(matchesDeckSearch(a, 'vi,')).toBe(true);
    expect(matchesDeckSearch(a, 'zzz')).toBe(false);
    expect(sortSummaries([a, b], 'name').map((s) => s.deck.id)).toEqual(['b', 'a']);
    expect(sortSummaries([a, b], 'recent').map((s) => s.deck.id)).toEqual(['b', 'a']);
    expect(sortSummaries([a, b], 'completeness')[0]?.deck.id).toBe('b');
  });

  it('filters and sorts legends', () => {
    const options = legendOptions(catalog, []);
    expect(options).toHaveLength(2);
    expect(filterLegends(options, 'jinx', 'ready').map((o) => o.legend.cardKey)).toEqual(['jinx-legend']);
    expect(filterLegends(options, '', 'name')[0]?.legend.cardKey).toBe('jinx-legend');
  });
});

describe('legend ranking and next step', () => {
  it('puts fully buildable legends before better scoring unfinished ones', async () => {
    const { rankReadiness } = await import('./listModel');
    const base = {
      legendKey: '',
      completeness: 0,
      ownedLegalCards: 0,
      championAvailable: false,
      championChoices: 0,
      nearMiss: 0,
      championStatus: 'resolved' as const,
      signatureOwned: 0,
      distinctMainCards: 0,
      sections: { legend: { have: 0, need: 1 }, main: { have: 0, need: 40 }, runes: { have: 0, need: 12 }, battlefields: { have: 0, need: 3 } },
    };
    const ranked = rankReadiness([
      { ...base, legendKey: 'close', score: 0.9, shortBy: 2 },
      { ...base, legendKey: 'ready-low', score: 0.4, shortBy: 0 },
      { ...base, legendKey: 'ready-high', score: 0.6, shortBy: 0 },
      { ...base, legendKey: 'far', score: 0.1, shortBy: 50 },
    ]);
    expect(ranked.map((r) => r.legendKey)).toEqual(['ready-high', 'ready-low', 'close', 'far']);
  });

  it('picks the most useful next step in priority order', async () => {
    const { nextStep } = await import('./assistModel');
    const input = { hasLegend: true, issues: [], fillCount: 0, championMissing: false, missingCopies: 0, catalog };
    expect(nextStep({ ...input, hasLegend: false }).kind).toBe('legend');
    expect(nextStep({ ...input, championMissing: true, fillCount: 5 }).kind).toBe('champion');
    expect(nextStep({ ...input, fillCount: 5 }).kind).toBe('fill');
    expect(nextStep({ ...input, missingCopies: 2 }).kind).toBe('buy');
    expect(nextStep(input).kind).toBe('done');
  });

  it('separates retired cards from the shopping list', async () => {
    const { buyableMissing, retiredKeys } = await import('./insightsModel');
    const d = deck({ main: [{ cardKey: 'gone', count: 2 }, { cardKey: 'fury-unit-1', count: 1 }] });
    expect(retiredKeys(d, catalog)).toEqual(['gone']);
    const missing = [
      { cardKey: 'gone', needed: 2, owned: 0, missing: 2 },
      { cardKey: 'fury-unit-1', needed: 1, owned: 0, missing: 1 },
    ];
    expect(buyableMissing(missing, catalog).map((m) => m.cardKey)).toEqual(['fury-unit-1']);
  });

  it('round trips a local draft copy', async () => {
    const { writeDraftCopy, readDraftCopy, clearDraftCopy } = await import('./draftStore');
    writeDraftCopy(deck(), 42);
    expect(readDraftCopy('d1')?.savedAt).toBe(42);
    clearDraftCopy('d1');
    expect(readDraftCopy('d1')).toBeUndefined();
  });
});

describe('pool model', () => {
  const legal = legalCards(catalog.cards['vi-legend'], catalog);
  const owned = ownedByCard(viCollection(), catalog);
  const base = { catalog, legal, section: 'main' as const, query: '', context: { owned: viCollection(), tagsByCard: {}, decksByCard: {} }, ownedByCard: owned, scope: 'all' as const, filters: NO_FILTERS, order: 'energy' as const };

  it('lists legal main deck cards by energy and excludes runes and off identity cards', () => {
    const keys = buildPool(base).map((e) => e.card.cardKey);
    expect(keys).toContain('fury-unit-1');
    expect(keys).not.toContain('fury-rune');
    expect(keys).not.toContain('chaos-unit');
    expect(keys.indexOf('fury-unit-1')).toBeLessThan(keys.indexOf('fury-unit-5'));
  });

  it('applies owned scope and filters', () => {
    const none = { ...base, context: { owned: [ownedRow('fury-unit-2', 1)], tagsByCard: {}, decksByCard: {} }, ownedByCard: { 'fury-unit-2': 1 } };
    expect(buildPool({ ...none, scope: 'owned' }).map((e) => e.card.cardKey)).toEqual(['fury-unit-2']);
    const filtered = buildPool({ ...base, filters: { ...NO_FILTERS, types: ['Spell'] } });
    expect(filtered.every((e) => e.card.type === 'Spell')).toBe(true);
    expect(buildPool({ ...base, filters: { ...NO_FILTERS, championsOnly: true } }).map((e) => e.card.cardKey)).toEqual(['vi-champ']);
    expect(buildPool({ ...base, filters: { ...NO_FILTERS, energies: [ENERGY_BUCKET_MAX] } }).map((e) => e.card.cardKey)).toEqual(['fury-unit-6']);
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it('uses the search query language on top of the legal pool', () => {
    const keys = buildPool({ ...base, query: 'cost:2' }).map((e) => e.card.cardKey);
    expect(keys).toContain('fury-unit-2');
    expect(keys).not.toContain('fury-unit-1');
    expect(buildPool({ ...base, query: 'chaos unit' }).map((e) => e.card.cardKey)).not.toContain('chaos-unit');
  });
});
