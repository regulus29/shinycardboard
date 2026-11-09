import type { Card, Catalog, Deck } from '../types';
import { defaultRules, type RulesConfig } from '../rules/rules';
import type { DeckIssue, DeckIssueCode, DeckSection, IssueSeverity } from './deck-types';
import {
  cardSection,
  copyLimitFor,
  sideboardAccepts,
  fitsIdentity,
  isChosenChampion,
  isLegend,
  isSignature,
  legendContext,
  matchesSignature,
  type LegendContext,
} from './identity';
import { mergeSlots, sectionSlots, sumCounts } from './slots';

interface Entry {
  card: Card;
  count: number;
}

/** A section's contents: every counted copy, plus the entries that resolved to a legal-placement card. */
interface ResolvedSection {
  total: number;
  entries: Entry[];
}

interface Check {
  deck: Deck;
  catalog: Catalog;
  rules: RulesConfig;
  legend: LegendContext | undefined;
  sections: Record<DeckSection, ResolvedSection>;
}

function severityOf(code: DeckIssueCode, rules: RulesConfig): IssueSeverity {
  // The JSON import types only the configured keys, so widen it to look codes up.
  const overrides = rules.issueSeverity as Record<string, string | undefined>;
  return overrides[code] === 'warning' ? 'warning' : 'error';
}

function issue(rules: RulesConfig, code: DeckIssueCode, message: string, cardKey?: string): DeckIssue {
  const base = { severity: severityOf(code, rules), code, message };
  return cardKey === undefined ? base : { ...base, cardKey };
}

/** Counts a noun, pluralizing a trailing consonant plus y as "ies" (copy -> copies). */
function plural(n: number, noun: string): string {
  if (n === 1) return `${n} ${noun}`;
  const word = /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  return `${n} ${word}`;
}

/** Wording for a required size: exact, or at least. */
function sizeRequirement(target: number, isMinimum: boolean): string {
  return isMinimum ? `at least ${target}` : `exactly ${target}`;
}

export function sizeOk(total: number, target: number, isMinimum: boolean): boolean {
  return isMinimum ? total >= target : total === target;
}

/** Whether a card may sit in the section. The sideboard takes only main deckable types. */
function belongsIn(card: Card, section: DeckSection, rules: RulesConfig): boolean {
  if (section === 'sideboard') return sideboardAccepts(card, rules);
  return cardSection(card, rules) === section;
}

function resolveSection(
  deck: Deck,
  section: DeckSection,
  catalog: Catalog,
  rules: RulesConfig,
  problems: DeckIssue[],
  reported: Set<string>,
): ResolvedSection {
  const merged = mergeSlots(sectionSlots(deck, section));
  const entries: Entry[] = [];
  for (const [cardKey, count] of merged) {
    const card = catalog.cards[cardKey];
    if (!card) {
      if (!reported.has(cardKey)) problems.push(issue(rules, 'unknown-card', `Card "${cardKey}" is not in the catalog.`, cardKey));
      reported.add(cardKey);
    } else if (!belongsIn(card, section, rules)) {
      problems.push(issue(rules, 'section-type', `${card.name} (${card.type}) cannot go in the ${section}.`, cardKey));
    } else {
      entries.push({ card, count });
    }
  }
  return { total: sumCounts(merged), entries };
}

function resolveLegend(deck: Deck, catalog: Catalog, rules: RulesConfig, problems: DeckIssue[]): LegendContext | undefined {
  if (!deck.legendKey) {
    problems.push(issue(rules, 'no-legend', 'Pick a Champion Legend to build around.'));
    return undefined;
  }
  const card = catalog.cards[deck.legendKey];
  if (!card) {
    problems.push(issue(rules, 'unknown-card', `Legend "${deck.legendKey}" is not in the catalog.`, deck.legendKey));
    return undefined;
  }
  if (!isLegend(card, rules)) {
    problems.push(issue(rules, 'no-legend', `${card.name} is not a Legend.`, deck.legendKey));
    return undefined;
  }
  return legendContext(card, catalog, rules, chosenChampionCard(deck, catalog));
}

function chosenChampionCard(deck: Deck, catalog: Catalog): Card | undefined {
  return deck.chosenChampionKey ? catalog.cards[deck.chosenChampionKey] : undefined;
}

function checkMainSize({ sections, rules }: Check): DeckIssue[] {
  const { total } = sections.main;
  if (sizeOk(total, rules.mainDeckSize, rules.mainDeckSizeIsMinimum)) return [];
  const need = sizeRequirement(rules.mainDeckSize, rules.mainDeckSizeIsMinimum);
  return [issue(rules, 'main-size', `Main deck has ${plural(total, 'card')}; it needs ${need}.`)];
}

/** Warn when the legend champion cannot be pinned down, so champion and signature checks are skipped. */
function checkChampionResolved({ legend, rules }: Check): DeckIssue[] {
  if (!legend || legend.resolution.status === 'resolved') return [];
  const why =
    legend.resolution.status === 'ambiguous'
      ? `several tags name a champion (${legend.resolution.tags.join(', ')}); choose a champion to settle it`
      : 'no tag on it names a champion in the catalog';
  return [issue(rules, 'champion-unresolved', `Cannot tell which champion ${legend.legend.name} uses: ${why}.`)];
}

/** The deck-level chosen champion, when set, must be a legal champion for the legend and in the main deck. */
function checkChosenChampionKey({ deck, catalog, legend, sections, rules }: Check): DeckIssue[] {
  const key = deck.chosenChampionKey;
  if (!key || !legend) return [];
  const card = catalog.cards[key];
  if (!card) return [issue(rules, 'unknown-card', `Chosen champion "${key}" is not in the catalog.`, key)];
  if (legend.resolution.status === 'resolved' && !isChosenChampion(card, legend, rules)) {
    return [issue(rules, 'no-champion', `${card.name} is not a champion of ${legend.legend.name}.`, key)];
  }
  if (!sections.main.entries.some((e) => e.card.cardKey === key)) {
    return [issue(rules, 'no-champion', `Chosen champion ${card.name} is not in the main deck.`, key)];
  }
  return [];
}

function checkChampion(check: Check): DeckIssue[] {
  const { deck, legend, sections, rules } = check;
  if (!legend || !rules.includesChosenChampion || legend.resolution.status !== 'resolved') return [];
  if (deck.chosenChampionKey) return checkChosenChampionKey(check);
  if (sections.main.entries.some((e) => isChosenChampion(e.card, legend, rules))) return [];
  return [issue(rules, 'no-champion', `Add a chosen champion for ${legend.legend.name} to the main deck.`)];
}

/** Entries across main and sideboard, merged by card when the limit spans both. */
function copyGroups({ sections, rules }: Check): Entry[][] {
  const main = sections.main.entries;
  const side = sections.sideboard.entries;
  if (!rules.copyLimitAppliesAcrossSideboard) return [main, side];
  const byKey = new Map<string, Entry>();
  for (const e of [...main, ...side]) {
    const seen = byKey.get(e.card.cardKey);
    byKey.set(e.card.cardKey, { card: e.card, count: (seen?.count ?? 0) + e.count });
  }
  return [[...byKey.values()]];
}

function checkCopyLimits(check: Check): DeckIssue[] {
  const { rules } = check;
  const found: DeckIssue[] = [];
  for (const group of copyGroups(check)) {
    for (const { card, count } of group) {
      const limit = copyLimitFor(card, rules);
      if (count > limit) {
        found.push(issue(rules, 'copy-limit', `${card.name}: ${plural(count, 'copy')}, the limit is ${limit}.`, card.cardKey));
      }
    }
  }
  return found;
}

function mainAndSideboard({ sections }: Check): Entry[] {
  return [...sections.main.entries, ...sections.sideboard.entries];
}

function checkDomainIdentity(check: Check): DeckIssue[] {
  const { legend, rules } = check;
  if (!legend) return [];
  const flagged = new Set<string>();
  for (const { card } of mainAndSideboard(check)) {
    if (!fitsIdentity(card, legend.identity, rules)) flagged.add(card.cardKey);
  }
  const identity = legend.identity.join(' and ');
  return [...flagged].map((key) => {
    const name = check.catalog.cards[key]?.name ?? key;
    return issue(rules, 'domain-identity', `${name} is outside the ${identity} identity of ${legend.legend.name}.`, key);
  });
}

function checkSignatures(check: Check): DeckIssue[] {
  const { legend, rules } = check;
  if (!legend || !rules.signatureRequiresMatchingLegend || legend.resolution.status !== 'resolved') return [];
  const flagged = new Map<string, Card>();
  for (const { card } of mainAndSideboard(check)) {
    if (isSignature(card, rules) && !matchesSignature(card, legend)) flagged.set(card.cardKey, card);
  }
  return [...flagged.values()].map((card) =>
    issue(rules, 'signature-mismatch', `${card.name} is a signature card for a different Legend than ${legend.legend.name}.`, card.cardKey),
  );
}

/**
 * At most `signatureLimit` Signature cards in total, whatever their names. The rule text is
 * silent on sideboards, so by default (conservative) the sideboard counts too.
 */
function checkSignatureLimit({ sections, rules }: Check): DeckIssue[] {
  const scoped = rules.signatureLimitAppliesAcrossSideboard ? [...sections.main.entries, ...sections.sideboard.entries] : sections.main.entries;
  const total = scoped.filter((e) => isSignature(e.card, rules)).reduce((sum, e) => sum + e.count, 0);
  if (total <= rules.signatureLimit) return [];
  const where = rules.signatureLimitAppliesAcrossSideboard ? 'Main deck and sideboard have' : 'Main deck has';
  return [issue(rules, 'signature-limit', `${where} ${plural(total, 'signature card')}; the limit is ${rules.signatureLimit} in total.`)];
}

function checkRunes({ legend, sections, rules }: Check): DeckIssue[] {
  const { total, entries } = sections.runes;
  const found: DeckIssue[] = [];
  if (total !== rules.runeDeckSize) {
    found.push(issue(rules, 'rune-size', `Rune deck has ${plural(total, 'rune')}; it needs exactly ${rules.runeDeckSize}.`));
  }
  if (!legend) return found;
  for (const { card } of entries) {
    if (!fitsIdentity(card, legend.identity, rules)) {
      found.push(issue(rules, 'rune-domain', `${card.name} does not match the domains of ${legend.legend.name}.`, card.cardKey));
    }
  }
  return found;
}

function checkBattlefields({ sections, rules }: Check): DeckIssue[] {
  const { total, entries } = sections.battlefields;
  const found: DeckIssue[] = [];
  if (total !== rules.battlefieldCount) {
    found.push(issue(rules, 'battlefield-count', `Battlefields: ${total} chosen, it needs exactly ${rules.battlefieldCount}.`));
  }
  for (const { card, count } of entries) {
    if (count > rules.battlefieldCopyLimit) {
      found.push(issue(rules, 'battlefield-duplicate', `${card.name} appears ${count} times; each battlefield may be used ${rules.battlefieldCopyLimit} time.`, card.cardKey));
    }
  }
  return found;
}

function checkSideboard({ sections, rules }: Check): DeckIssue[] {
  const { total } = sections.sideboard;
  if (rules.sideboardSizes.includes(total)) return [];
  const allowed = rules.sideboardSizes.join(' or ');
  return [issue(rules, 'sideboard-size', `Sideboard has ${plural(total, 'card')}; it must be ${allowed}.`)];
}

const CHECKS: Array<(check: Check) => DeckIssue[]> = [
  checkMainSize,
  checkChampionResolved,
  checkChampion,
  checkCopyLimits,
  checkDomainIdentity,
  checkSignatures,
  checkSignatureLimit,
  checkRunes,
  checkBattlefields,
  checkSideboard,
];

/** Rule check. Data driven: reads every limit from RulesConfig. Never throws on bad data. */
export function validateDeck(deck: Deck, catalog: Catalog, rules: RulesConfig = defaultRules): DeckIssue[] {
  const problems: DeckIssue[] = [];
  const reported = new Set<string>();
  const legend = resolveLegend(deck, catalog, rules, problems);
  const names: DeckSection[] = ['main', 'runes', 'battlefields', 'sideboard'];
  const sections = Object.fromEntries(
    names.map((s) => [s, resolveSection(deck, s, catalog, rules, problems, reported)]),
  ) as Record<DeckSection, ResolvedSection>;
  const check: Check = { deck, catalog, rules, legend, sections };
  return [...problems, ...CHECKS.flatMap((run) => run(check))];
}
