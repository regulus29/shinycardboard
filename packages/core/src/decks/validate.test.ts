import { describe, expect, it } from 'vitest';
import { defaultRules, type RulesConfig } from '../rules/rules';
import type { DeckIssueCode } from './deck-types';
import { validateDeck } from './validate';
import { fillerCards, fixtureCards, legalViDeck, makeCard, makeCatalog, makeDeck, slot } from './testing';

const catalog = makeCatalog([...fixtureCards(), ...fillerCards(22), ...fillerCards(8, 'side')]);
const codes = (deck = legalViDeck(), rules: RulesConfig = defaultRules) =>
  validateDeck(deck, catalog, rules).map((i) => i.code);
const withMain = (extra: ReturnType<typeof slot>[], base = legalViDeck()) =>
  legalViDeck({ main: [...base.main.slice(0, 5), ...extra, ...base.main.slice(5)] });

describe('validateDeck: legal decks', () => {
  it('accepts a complete legal deck with no issues', () => {
    expect(validateDeck(legalViDeck(), catalog)).toEqual([]);
  });

  it('allows an off-identity Colorless card and any battlefield', () => {
    expect(codes(withMain([slot('colorless-unit', 0)]))).toEqual([]);
  });
});

describe('validateDeck: legend', () => {
  it('flags a missing legend and skips identity checks', () => {
    const found = codes(legalViDeck({ legendKey: undefined, main: [slot('chaos-unit', 3), ...legalViDeck().main] }));
    expect(found).toContain('no-legend');
    expect(found).not.toContain('domain-identity');
    expect(found).not.toContain('no-champion');
  });

  it('flags a legend key that is not in the catalog as an unknown card', () => {
    const issues = validateDeck(legalViDeck({ legendKey: 'nobody' }), catalog);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'unknown-card', cardKey: 'nobody' }));
  });

  it('flags a legend key that is not a Legend', () => {
    const issues = validateDeck(legalViDeck({ legendKey: 'fury-spell' }), catalog);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'no-legend', cardKey: 'fury-spell' }));
  });
});

describe('validateDeck: main deck size and champion', () => {
  it('flags a main deck that is too small', () => {
    const deck = legalViDeck({ main: legalViDeck().main.slice(0, 4) });
    expect(validateDeck(deck, catalog)).toContainEqual(expect.objectContaining({ code: 'main-size', severity: 'error' }));
  });

  it('treats the size as a minimum by default and as exact when configured', () => {
    const roomy = legalViDeck({ main: [...legalViDeck().main, slot('filler-7', 1)] });
    expect(codes(roomy)).not.toContain('main-size');
    expect(codes(roomy, { ...defaultRules, mainDeckSizeIsMinimum: false })).toContain('main-size');
  });

  it('requires a chosen champion sharing the legend champion tag', () => {
    const main = legalViDeck().main.filter((s) => !s.cardKey.startsWith('vi-'));
    const deck = legalViDeck({ main: [...main, slot('jinx-demolitionist', 3)] });
    const found = codes(deck);
    expect(found).toContain('no-champion');
  });

  it('skips the champion check when the rules do not include it in the main deck', () => {
    const main = legalViDeck().main.filter((s) => !s.cardKey.startsWith('vi-'));
    const deck = legalViDeck({ main: [...main, slot('order-unit', 6)] });
    expect(codes(deck, { ...defaultRules, includesChosenChampion: false })).not.toContain('no-champion');
  });

});

describe('validateDeck: copy limit', () => {
  it('flags more than three copies in one slot', () => {
    const issues = validateDeck(withMain([slot('fury-spell', 4)]), catalog);
    expect(issues.filter((i) => i.code === 'copy-limit')).toEqual([expect.objectContaining({ cardKey: 'fury-spell' })]);
  });

  it('merges duplicate slots of the same card before counting', () => {
    const rest = legalViDeck().main.filter((s) => s.cardKey !== 'colorless-unit');
    const deck = legalViDeck({ main: [...rest, slot('colorless-unit', 2), slot('colorless-unit', 2)] });
    const flagged = validateDeck(deck, catalog).filter((i) => i.code === 'copy-limit');
    expect(flagged).toEqual([expect.objectContaining({ cardKey: 'colorless-unit' })]);
  });

  it('counts the sideboard toward the limit when the rules say so', () => {
    const deck = legalViDeck({ sideboard: [slot('order-unit', 1)] });
    expect(codes(deck)).toContain('copy-limit');
    expect(codes(deck, { ...defaultRules, copyLimitAppliesAcrossSideboard: false })).not.toContain('copy-limit');
  });

  it('does not limit copies of runes', () => {
    expect(codes(legalViDeck({ runes: [slot('fury-rune', 12)] }))).toEqual([]);
  });

  it('follows a changed copy limit from the config', () => {
    expect(codes(legalViDeck(), { ...defaultRules, copyLimit: 2 })).toContain('copy-limit');
  });
});

describe('validateDeck: domain identity', () => {
  it('flags a unit outside the legend domains', () => {
    const issues = validateDeck(withMain([slot('chaos-unit', 1)]), catalog);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'domain-identity', cardKey: 'chaos-unit' }));
  });

  it('requires every domain of a multi-domain card to be in the identity', () => {
    expect(codes(withMain([slot('mixed-spell', 1)]))).toContain('domain-identity');
  });

  it('applies to the sideboard too', () => {
    expect(codes(legalViDeck({ sideboard: [slot('chaos-unit', 1)] }))).toContain('domain-identity');
  });

  it('flags Colorless cards when colorlessAlwaysLegal is off', () => {
    expect(codes(legalViDeck(), { ...defaultRules, colorlessAlwaysLegal: false })).toContain('domain-identity');
  });
});

describe('validateDeck: runes', () => {
  it('flags the wrong number of runes', () => {
    expect(codes(legalViDeck({ runes: [slot('fury-rune', 11)] }))).toContain('rune-size');
    expect(codes(legalViDeck({ runes: [slot('fury-rune', 13)] }))).toContain('rune-size');
  });

  it('flags a rune outside the legend domains', () => {
    const deck = legalViDeck({ runes: [slot('fury-rune', 6), slot('chaos-rune', 6)] });
    expect(validateDeck(deck, catalog)).toContainEqual(expect.objectContaining({ code: 'rune-domain', cardKey: 'chaos-rune' }));
  });

  it('counts duplicate rune slots together', () => {
    const deck = legalViDeck({ runes: [slot('fury-rune', 6), slot('fury-rune', 6)] });
    expect(codes(deck)).toEqual([]);
  });
});

describe('validateDeck: battlefields', () => {
  it('flags too few and too many battlefields', () => {
    expect(codes(legalViDeck({ battlefields: [slot('bf-a'), slot('bf-b')] }))).toContain('battlefield-count');
    const four = legalViDeck({ battlefields: [slot('bf-a'), slot('bf-b'), slot('bf-c'), slot('bf-a')] });
    expect(codes(four)).toContain('battlefield-count');
  });

  it('flags a repeated battlefield even when the count is right', () => {
    const deck = legalViDeck({ battlefields: [slot('bf-a', 2), slot('bf-b')] });
    const found = codes(deck);
    expect(found).toContain('battlefield-duplicate');
    expect(found).not.toContain('battlefield-count');
  });
});

describe('validateDeck: sideboard', () => {
  it('reports an odd sideboard size as a warning', () => {
    const issues = validateDeck(legalViDeck({ sideboard: [slot('fury-spell', 3)] }), catalog);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'sideboard-size', severity: 'warning' }));
  });

  it('accepts exactly eight sideboard cards', () => {
    const side = [slot('side-0', 3), slot('side-1', 3), slot('side-2', 2)];
    expect(codes(legalViDeck({ sideboard: side }))).toEqual([]);
  });

  it('lets config promote the severity to an error', () => {
    const rules = { ...defaultRules, issueSeverity: { 'sideboard-size': 'error' } } as RulesConfig;
    const issues = validateDeck(legalViDeck({ sideboard: [slot('filler-0', 1)] }), catalog, rules);
    expect(issues.find((i) => i.code === 'sideboard-size')?.severity).toBe('error');
  });
});

describe('validateDeck: signature cards', () => {
  it('accepts the signature card of the chosen legend', () => {
    expect(codes()).not.toContain('signature-mismatch');
  });

  it('flags the signature card of another legend', () => {
    const deck = legalViDeck({ main: [...legalViDeck().main, slot('get-excited', 1)] });
    const found = codes(deck);
    expect(found).toContain('signature-mismatch');
  });

  it('can be switched off in the rules', () => {
    const deck = legalViDeck({ main: [...legalViDeck().main, slot('get-excited', 1)] });
    expect(codes(deck, { ...defaultRules, signatureRequiresMatchingLegend: false })).not.toContain('signature-mismatch');
  });
});

describe('validateDeck: bad data', () => {
  it('flags unknown cards once and never throws', () => {
    const deck = legalViDeck({ main: [...legalViDeck().main, slot('ghost', 2)], sideboard: [slot('ghost', 1)] });
    const issues = validateDeck(deck, catalog).filter((i) => i.code === 'unknown-card');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.cardKey).toBe('ghost');
  });

  it('flags cards placed in the wrong section', () => {
    const deck = legalViDeck({
      main: [...legalViDeck().main, slot('fury-rune', 1), slot('recruit-token', 1), slot('vi-piltover-enforcer', 1)],
      runes: [...legalViDeck().runes, slot('fury-spell', 1)],
    });
    const wrong = validateDeck(deck, catalog).filter((i) => i.code === 'section-type').map((i) => i.cardKey);
    expect(wrong.sort()).toEqual(['fury-rune', 'fury-spell', 'recruit-token', 'vi-piltover-enforcer']);
  });

  it('flags an empty deck with every structural issue', () => {
    const found = codes(makeDeck());
    expect(found).toEqual(expect.arrayContaining(['no-legend', 'main-size', 'rune-size', 'battlefield-count'] satisfies DeckIssueCode[]));
  });

  it('ignores zero, negative, fractional and non finite counts', () => {
    const deck = legalViDeck({ main: [...legalViDeck().main, slot('chaos-unit', 0), slot('chaos-unit', -3), slot('chaos-unit', Number.NaN)] });
    expect(validateDeck(deck, catalog)).toEqual([]);
    const rest = legalViDeck().main.filter((s) => s.cardKey !== 'fury-spell');
    const fractional = legalViDeck({ main: [...rest, slot('fury-spell', 3.9)] });
    expect(codes(fractional)).not.toContain('copy-limit');
  });

  it('tolerates a stored deck missing a section array', () => {
    const broken = { ...legalViDeck(), sideboard: undefined } as unknown as ReturnType<typeof legalViDeck>;
    expect(() => validateDeck(broken, catalog)).not.toThrow();
  });
});
