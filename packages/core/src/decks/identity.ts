/**
 * Rules model: who a Legend is, what its chosen champion and signature cards are,
 * and which cards the legend may play. Provenance of each rule is in rules.config.json
 * and docs/deck-rules-notes.md.
 *
 * Findings from 1451 records and Core Rules 1.5:
 * - Domain identity: a Legend carries one or two domains (never Colorless). A card is
 *   legal when every one of its domains is in that identity. A card with no domain
 *   (labeled Colorless in the data) fits any identity. In the real data only Battlefields
 *   and Tokens carry it, so no deckable main deck card is Colorless today.
 * - Runes carry exactly one domain. Any split of the 12 runes over the identity is legal.
 * - Legend tags are not always the champion name. Some legends list a faction first
 *   ("Yordle", "Kennen"). The champion tag is the legend tag that is also the name of a
 *   Champion unit ("Kennen, Keeper of Balance" carries tag Kennen). Faction tags never
 *   match a champion name, so they are never guessed. If no legend tag matches, the
 *   champion is "unresolved"; if several match, it is "ambiguous". Neither falls back
 *   to a faction tag. A Deck.chosenChampionKey can settle an ambiguous legend.
 * - Chosen champion: a Unit with supertype Champion carrying the champion tag. Signature
 *   units are not eligible (their supertype is Signature).
 * - Signature cards: supertype Signature. They carry the champion tag of one legend. A
 *   deck may hold at most `signatureLimit` of them in total.
 * - Tokens (supertype Token) are never deckable.
 *
 * The catalog is treated as immutable, so per-catalog lookups are cached in a WeakMap.
 */
import type { Card, Catalog, Domain } from '../types';
import type { CardSection } from './deck-types';
import type { RulesConfig } from '../rules/rules';

/** The section a card naturally belongs in, or null when it is not deckable (Legend, Token). */
export function cardSection(card: Card, rules: RulesConfig): CardSection | null {
  const c = rules.classification;
  if (card.supertype && c.nonDeckableSupertypes.includes(card.supertype)) return null;
  if (card.type === c.runeType) return 'runes';
  if (card.type === c.battlefieldType) return 'battlefields';
  return c.mainDeckTypes.includes(card.type) ? 'main' : null;
}

/** The sideboard swaps main deck cards, so it takes only the configured main deckable types. */
export function sideboardAccepts(card: Card, rules: RulesConfig): boolean {
  return cardSection(card, rules) !== null && rules.classification.sideboardTypes.includes(card.type);
}

export function isLegend(card: Card, rules: RulesConfig): boolean {
  return card.type === rules.classification.legendType;
}

export function isSignature(card: Card, rules: RulesConfig): boolean {
  return card.supertype === rules.classification.signatureSupertype;
}

export function isChampionUnit(card: Card, rules: RulesConfig): boolean {
  const c = rules.classification;
  return card.type === c.championType && card.supertype === c.championSupertype;
}

/** The champion a card is named for: "Vi - Peacekeeper" and "Vi, Destructive" both give "Vi". */
export function championNameOf(card: Card): string {
  return card.name.split(/\s+-\s+|,\s*/)[0] ?? card.name;
}

const normalizedCache = new Map<string, string>();

/** Case and punctuation folded form used to compare names and tags. Memoized: tags repeat a lot. */
function normalizeName(text: string): string {
  const cached = normalizedCache.get(text);
  if (cached !== undefined) return cached;
  const folded = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  normalizedCache.set(text, folded);
  return folded;
}

/** Normalized tags that name a champion: some Champion unit is called after the tag and carries it. Cached per catalog. */
const championTagCache = new WeakMap<Catalog, Set<string>>();

function championNameTags(catalog: Catalog, rules: RulesConfig): Set<string> {
  const cached = championTagCache.get(catalog);
  if (cached) return cached;
  const named = new Set<string>();
  for (const card of Object.values(catalog.cards)) {
    if (!isChampionUnit(card, rules)) continue;
    const name = normalizeName(championNameOf(card));
    for (const tag of card.tags) if (normalizeName(tag) === name) named.add(name);
  }
  championTagCache.set(catalog, named);
  return named;
}

export type ChampionResolution =
  | { status: 'resolved'; tag: string }
  | { status: 'ambiguous'; tags: string[] }
  | { status: 'unresolved' };

/** Which tag identifies the legend champion. Never guesses a faction tag. */
export function resolveLegendChampion(legend: Card, catalog: Catalog, rules: RulesConfig): ChampionResolution {
  const named = championNameTags(catalog, rules);
  const tags = [...new Set(legend.tags.filter((t) => named.has(normalizeName(t))))];
  if (tags.length === 0) return { status: 'unresolved' };
  const [only] = tags;
  return tags.length === 1 && only !== undefined ? { status: 'resolved', tag: only } : { status: 'ambiguous', tags };
}

/** Tags a card must carry to belong to the legend champion. Empty when not resolved. */
export function legendChampionTags(legend: Card, catalog: Catalog, rules: RulesConfig): string[] {
  const resolution = resolveLegendChampion(legend, catalog, rules);
  return resolution.status === 'resolved' ? [resolution.tag] : [];
}

/** Tags match ignoring case and punctuation, so "Rek'Sai" and "Rek'sai" are one tag. */
export function tagIn(tag: string, tags: string[]): boolean {
  return tags.some((o) => o === tag || normalizeName(o) === normalizeName(tag));
}

export function sharesTag(card: Card, tags: string[]): boolean {
  return card.tags.some((t) => tagIn(t, tags));
}

/** Domains a legend lets its deck use. Colorless is handled separately by the rules flag. */
export function legendIdentity(legend: Card, rules: RulesConfig): Domain[] {
  return legend.domains.filter((d) => d !== rules.classification.colorlessDomain);
}

/** Everything derived from a legend once, so per-card checks stay cheap. */
export interface LegendContext {
  legend: Card;
  identity: Domain[];
  resolution: ChampionResolution;
  /** Champion tag as a list: one entry when resolved, otherwise empty. */
  championTags: string[];
}

/**
 * Build the context. An ambiguous legend is settled when the chosen champion carries
 * exactly one of the competing tags.
 */
export function legendContext(
  legend: Card,
  catalog: Catalog,
  rules: RulesConfig,
  chosenChampion?: Card,
): LegendContext {
  let resolution = resolveLegendChampion(legend, catalog, rules);
  if (resolution.status === 'ambiguous' && chosenChampion) {
    const matching = resolution.tags.filter((t) => sharesTag(chosenChampion, [t]));
    const [only] = matching;
    if (matching.length === 1 && only !== undefined) resolution = { status: 'resolved', tag: only };
  }
  const championTags = resolution.status === 'resolved' ? [resolution.tag] : [];
  return { legend, identity: legendIdentity(legend, rules), resolution, championTags };
}

/** True when the card is a Champion unit that can be this legend's chosen champion. */
export function isChosenChampion(card: Card, ctx: LegendContext, rules: RulesConfig): boolean {
  return isChampionUnit(card, rules) && sharesTag(card, ctx.championTags);
}

/** Signature cards belong to one legend through the champion tag. */
export function matchesSignature(card: Card, ctx: LegendContext): boolean {
  return sharesTag(card, ctx.championTags);
}

/** Every domain on the card lies in the identity, or is Colorless when that is always legal. */
export function fitsIdentity(card: Card, identity: Domain[], rules: RulesConfig): boolean {
  const colorless = rules.classification.colorlessDomain;
  return card.domains.every(
    (d) => identity.includes(d) || (rules.colorlessAlwaysLegal && d === colorless),
  );
}

/** Copy limit for a card in the main deck or sideboard. Infinity when exempt (basic runes). */
export function copyLimitFor(card: Card, rules: RulesConfig): number {
  if (rules.classification.copyLimitExemptTypes.includes(card.type)) return Infinity;
  if (card.type === rules.classification.battlefieldType) return rules.battlefieldCopyLimit;
  return rules.copyLimit;
}

/**
 * Whether a card is legal in a deck built around the legend. Battlefields ignore domain
 * identity (the data gives them no domain). Without a legend only deckability applies and
 * signature cards are excluded.
 */
export function isLegalFor(card: Card, ctx: LegendContext | undefined, rules: RulesConfig): boolean {
  if (cardSection(card, rules) === null) return false;
  const restricted = rules.signatureRequiresMatchingLegend && isSignature(card, rules);
  if (!ctx) return !restricted;
  const domainFree = card.type === rules.classification.battlefieldType;
  if (!domainFree && !fitsIdentity(card, ctx.identity, rules)) return false;
  return restricted ? matchesSignature(card, ctx) : true;
}
