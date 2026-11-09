/**
 * Checks the rules model and assist tools against the real Riftcodex dump
 * (data/raw/cards.json, gitignored) through the real buildCatalog.
 * Skipped when the file is absent, for example on a fresh clone or in CI.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Card, Domain, RiftcodexCard } from '../types';
import { buildCatalog } from '../catalog/build';
import { defaultRules } from '../rules/rules';
import { buildableLegends } from './buildable';
import { cardSection, isChampionUnit, resolveLegendChampion } from './identity';
import { legalCards } from './legal';
import { suggestFill } from './suggest';
import { makeDeck, ownCards } from './testing';
import { validateDeck } from './validate';

const RAW_PATH = new URL('../../../../data/raw/cards.json', import.meta.url);
const rules = defaultRules;

describe.skipIf(!existsSync(RAW_PATH))('rules model against the real dataset', () => {
  const raw = JSON.parse(readFileSync(RAW_PATH, 'utf-8')) as RiftcodexCard[];
  const catalog = buildCatalog(raw, 'real-data-test');
  const cards = Object.values(catalog.cards);
  const legends = cards.filter((c) => c.type === 'Legend');
  const championsOf = (tag: string) => cards.filter((c) => isChampionUnit(c, rules) && c.tags.includes(tag));
  const within = (c: Card, domains: Domain[]) => c.domains.every((d) => domains.includes(d));

  it('resolves exactly one champion tag for every legend', () => {
    for (const legend of legends) {
      expect(resolveLegendChampion(legend, catalog, rules).status, legend.cardKey).toBe('resolved');
    }
  });

  it('keeps every chosen champion inside its legend domain identity', () => {
    for (const legend of legends) {
      const resolution = resolveLegendChampion(legend, catalog, rules);
      if (resolution.status !== 'resolved') continue;
      const pool = championsOf(resolution.tag);
      expect(pool.length, legend.cardKey).toBeGreaterThan(0);
      for (const champion of pool) expect(within(champion, legend.domains), `${champion.cardKey} vs ${legend.cardKey}`).toBe(true);
    }
  });

  // Was a known failure while the catalog split legends such as 'defender-of-tomorrow' and
  // 'jayce-defender-of-tomorrow'. The catalog now merges them; keep this as a regression guard.
  it('has one legend card per legend identity (domains plus rules text)', () => {
    const seen = new Map<string, string[]>();
    for (const l of legends) {
      const identity = `${[...l.domains].sort().join('+')}|${l.rulesText}`;
      seen.set(identity, [...(seen.get(identity) ?? []), l.cardKey]);
    }
    const duplicates = [...seen.values()].filter((keys) => keys.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('has no deckable Colorless card besides battlefields, and tokens are never legal', () => {
    const colorless = cards.filter((c) => c.domains.includes('Colorless'));
    const deckable = colorless.filter((c) => cardSection(c, rules) !== null);
    expect(deckable.every((c) => c.type === 'Battlefield')).toBe(true);
    expect(colorless.some((c) => c.supertype === 'Token')).toBe(true);
    const vi = catalog.cards['vi-piltover-enforcer'];
    const pool = legalCards(vi, catalog);
    expect(pool.some((c) => c.supertype === 'Token')).toBe(false);
    expect(pool.filter((c) => c.type === 'Battlefield')).toHaveLength(cards.filter((c) => c.type === 'Battlefield').length);
  });

  it('lists the Vi signature card and excludes other legend signature cards', () => {
    const vi = catalog.cards['vi-piltover-enforcer'];
    const names = legalCards(vi, catalog).filter((c) => c.supertype === 'Signature').map((c) => c.name);
    expect(names).toContain('Hextech Gauntlets');
    expect(names).not.toContain('Death from Below');
  });

  it('builds a rule-legal deck from suggestions for every legend when every card is owned', () => {
    const owned = ownCards(catalog, cards.filter((c) => c.type !== 'Rune'), 3).concat(
      ownCards(catalog, cards.filter((c) => c.type === 'Rune'), rules.runeDeckSize),
    );
    for (const legend of legends) {
      const picks = suggestFill(makeDeck({ legendKey: legend.cardKey }), owned, catalog);
      const section = (name: string) => picks.filter((p) => p.section === name).map((p) => ({ cardKey: p.cardKey, count: p.count }));
      const chosen = picks.find((p) => p.role === 'chosen-champion')?.cardKey;
      const deck = makeDeck({
        legendKey: legend.cardKey,
        ...(chosen ? { chosenChampionKey: chosen } : {}),
        main: section('main'), runes: section('runes'), battlefields: section('battlefields'),
      });
      const errors = validateDeck(deck, catalog).filter((i) => i.severity === 'error');
      expect(errors, legend.cardKey).toEqual([]);
    }
  });

  it('keeps suggested decks coherent: one chosen champion line and few other champions', () => {
    const owned = ownCards(catalog, cards.filter((c) => c.type !== 'Rune'), 3);
    const picks = suggestFill(makeDeck({ legendKey: 'vi-piltover-enforcer' }), owned, catalog);
    const champions = picks.filter((p) => p.section === 'main' && isChampionUnit(catalog.cards[p.cardKey] as Card, rules));
    expect(champions.length).toBeGreaterThan(0);
    expect(champions.length).toBeLessThanOrEqual(1 + 2);
    expect(champions[0]?.role).toBe('chosen-champion');
    expect(picks.filter((p) => p.role === 'chosen-champion')).toHaveLength(1);
  });

  describe('partial collections', () => {
    const furyOrder: Domain[] = ['Fury', 'Order'];
    const collection = () => {
      const pool = cards.filter((c) => c.type !== 'Legend' && c.supertype !== 'Token' && within(c, furyOrder));
      const runes = pool.filter((c) => c.type === 'Rune');
      const rest = pool.filter((c) => c.type !== 'Rune');
      const vi = catalog.cards['vi-piltover-enforcer'] as Card;
      return [...ownCards(catalog, rest, 3), ...ownCards(catalog, runes, 6), ...ownCards(catalog, [vi], 1)];
    };

    it('separates legends instead of tying them, and ranks the owned Fury/Order legend first', () => {
      const ranked = buildableLegends(catalog, collection());
      expect(new Set(ranked.map((r) => r.score)).size).toBeGreaterThan(5);
      expect(ranked[0]?.legendKey).toBe('vi-piltover-enforcer');
      const vi = ranked[0];
      expect(vi?.sections.legend).toEqual({ have: 1, need: 1 });
      expect(vi?.championAvailable).toBe(true);
      expect(vi?.signatureOwned).toBeGreaterThan(0);
    });

    it('scores legends outside the owned domains below legends inside them', () => {
      const ranked = buildableLegends(catalog, collection());
      const byKey = new Map(ranked.map((r) => [r.legendKey, r]));
      const inside = byKey.get('darius-hand-of-noxus');
      const outside = byKey.get('ahri-nine-tailed-fox');
      expect(inside && outside && inside.score > outside.score).toBe(true);
      expect(outside?.championAvailable).toBe(false);
    });

    it('counts mono-domain runes as a complete rune deck for a two domain legend', () => {
      const furyRunes = cards.filter((c) => c.type === 'Rune' && c.domains.includes('Fury'));
      const owned = ownCards(catalog, furyRunes, rules.runeDeckSize);
      const vi = buildableLegends(catalog, owned).find((r) => r.legendKey === 'vi-piltover-enforcer');
      expect(vi?.sections.runes).toEqual({ have: rules.runeDeckSize, need: rules.runeDeckSize });
    });

    it('stays within the time budget on the real catalog', () => {
      const owned = collection();
      const started = performance.now();
      buildableLegends(catalog, owned);
      expect(performance.now() - started).toBeLessThan(100);
    });
  });
});
