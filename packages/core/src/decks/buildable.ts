import type { Card, Catalog, OwnedEntry } from '../types';
import { defaultAssist, defaultRules, type AssistConfig, type RulesConfig } from '../rules/rules';
import type { CardSection, LegendReadiness } from './deck-types';
import {
  cardSection,
  copyLimitFor,
  isChosenChampion,
  isLegalFor,
  isLegend,
  isSignature,
  legendContext,
  sharesTag,
  type LegendContext,
} from './identity';
import { ownedByCard, ownedCards, type OwnedCard } from './ownership';

interface SectionPool {
  section: CardSection;
  card: OwnedCard;
}

/** Usable owned copies for one legend, before the deck size caps are applied. */
interface Usable {
  main: number;
  signature: number;
  runes: number;
  battlefields: number;
  distinctMain: number;
  championChoices: number;
  /** Owned copies that are not legal here but overlap the legend (a shared domain or its champion tag). Tie-breaker. */
  nearMiss: number;
}

/** Not legal for the legend, yet close: shares a domain with its identity or carries its champion tag. */
function overlaps(card: Card, ctx: LegendContext): boolean {
  return card.domains.some((d) => ctx.identity.includes(d)) || sharesTag(card, ctx.championTags);
}

function tally(pool: SectionPool[], ctx: LegendContext, rules: RulesConfig): Usable {
  const usable: Usable = { main: 0, signature: 0, runes: 0, battlefields: 0, distinctMain: 0, championChoices: 0, nearMiss: 0 };
  for (const { section, card } of pool) {
    const copies = Math.min(card.owned, copyLimitFor(card.card, rules));
    if (!isLegalFor(card.card, ctx, rules)) {
      if (overlaps(card.card, ctx)) usable.nearMiss += copies;
      continue;
    }
    if (section !== 'main') {
      usable[section] += copies;
    } else if (isSignature(card.card, rules)) {
      usable.signature += copies;
    } else {
      usable.main += copies;
    }
    if (section !== 'main') continue;
    usable.distinctMain += 1;
    if (isChosenChampion(card.card, ctx, rules)) usable.championChoices += 1;
  }
  return usable;
}

function clampShare(value: number, target: number): number {
  return target <= 0 ? 0 : Math.min(value, target) / target;
}

/**
 * Rank every legend by how much of a complete deck the collection could fill: the legend
 * itself, a legal main deck with a chosen champion, a rune deck and the battlefields.
 * Copies are capped by the copy limit and the signature limit, so one owned card cannot
 * fill the deck alone. Rune decks need only runes inside the legend identity: the rules
 * allow any split, so twelve runes of one domain complete a two domain legend.
 *
 * `completeness` is the honest filled share of slots. `score` blends it with champion
 * availability, signature coverage and distinct card depth (assist.config.json) so that
 * legends with the same pool still separate. Sorted by score, then nearMiss (owned
 * copies that overlap the legend without being legal), then ownedLegalCards, then legendKey. Cost is legends x owned cards, far below 100 ms for ~1500 cards.
 */
export function buildableLegends(
  catalog: Catalog,
  owned: OwnedEntry[],
  rules: RulesConfig = defaultRules,
  assist: AssistConfig = defaultAssist,
): LegendReadiness[] {
  const pool: SectionPool[] = ownedCards(owned, catalog).flatMap((card) => {
    const section = cardSection(card.card, rules);
    return section === null ? [] : [{ section, card }];
  });
  const ownedCounts = ownedByCard(owned, catalog);
  const need = { legend: rules.legendCount, main: rules.mainDeckSize, runes: rules.runeDeckSize, battlefields: rules.battlefieldCount };
  const total = need.legend + need.main + need.runes + need.battlefields;
  const w = assist.readiness;

  const results = Object.values(catalog.cards)
    .filter((card) => isLegend(card, rules))
    .map((legend): LegendReadiness => {
      const ctx = legendContext(legend, catalog, rules);
      const usable = tally(pool, ctx, rules);
      const signature = Math.min(usable.signature, rules.signatureLimit);
      const mainUsable = usable.main + signature;
      const championAvailable = usable.championChoices > 0;
      const championGap = rules.includesChosenChampion && !championAvailable ? 1 : 0;
      const have = {
        legend: Math.min(ownedCounts[legend.cardKey] ?? 0, need.legend),
        main: Math.min(mainUsable, need.main - championGap),
        runes: Math.min(usable.runes, need.runes),
        battlefields: Math.min(usable.battlefields, need.battlefields),
      };
      const filled = have.legend + have.main + have.runes + have.battlefields;
      const completeness = filled / total;
      const score =
        completeness * w.fill +
        clampShare(usable.championChoices, w.championTargetChoices) * w.champion +
        clampShare(signature, rules.signatureLimit) * w.signature +
        clampShare(usable.distinctMain, w.depthTargetDistinct) * w.depth;
      return {
        legendKey: legend.cardKey,
        completeness,
        score,
        ownedLegalCards: mainUsable,
        shortBy: total - filled,
        championAvailable,
        championChoices: usable.championChoices,
        nearMiss: usable.nearMiss,
        championStatus: ctx.resolution.status,
        signatureOwned: signature,
        distinctMainCards: usable.distinctMain,
        sections: {
          legend: { have: have.legend, need: need.legend },
          main: { have: have.main, need: need.main },
          runes: { have: have.runes, need: need.runes },
          battlefields: { have: have.battlefields, need: need.battlefields },
        },
      };
    });
  return results.sort(
    (a, b) => b.score - a.score || b.nearMiss - a.nearMiss || b.ownedLegalCards - a.ownedLegalCards || a.legendKey.localeCompare(b.legendKey),
  );
}
