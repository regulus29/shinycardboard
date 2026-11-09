import type { Card, Catalog } from '../types';
import { defaultRules, type RulesConfig } from '../rules/rules';
import { isLegalFor, legendContext } from './identity';

/**
 * Cards legal to add to a deck given its legend, in catalog order: main deck cards, runes
 * and battlefields. Legends and tokens are never listed. Without a legend there is no
 * domain limit, but signature cards are left out because they need a matching legend. When the
 * legend champion cannot be resolved, signature cards are left out too. The optional chosen
 * champion settles a legend whose champion tag is ambiguous.
 */
export function legalCards(
  legend: Card | undefined,
  catalog: Catalog,
  rules: RulesConfig = defaultRules,
  chosenChampion?: Card,
): Card[] {
  const ctx = legend ? legendContext(legend, catalog, rules, chosenChampion) : undefined;
  return Object.values(catalog.cards).filter((card) => isLegalFor(card, ctx, rules));
}
