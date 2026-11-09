import type { CardType, Domain, RiftcodexCard } from '../types';
import { slugify } from './slug';
import { CARD_TYPES, DOMAINS } from './vocabulary';
import { detectVariant, PROMO_REPRINT, splitName, withoutAltMarker, type VariantInfo } from './variant';

/** A raw record with everything derivable from the record alone. */
export interface Prepared extends VariantInfo {
  record: RiftcodexCard;
  baseName: string;
  /** Slug of the base name; becomes the cardKey unless rules disagree (see assignCardKeys). */
  nameSlug: string;
  type: CardType;
  domains: Domain[];
}

export interface Skipped {
  sourceId: string;
  name: string;
  reason: string;
}

const TYPE_SET = new Set<string>(CARD_TYPES);
const DOMAIN_SET = new Set<string>(DOMAINS);

/** Returns the prepared record, or the reason it cannot be modelled. */
export function prepare(record: RiftcodexCard): Prepared | Skipped {
  const skipped = (reason: string): Skipped => ({ sourceId: record.id, name: record.name, reason });
  const type = record.classification.type;
  if (!TYPE_SET.has(type)) return skipped(`unknown card type "${type}"`);
  const unknownDomain = record.classification.domain.find((domain) => !DOMAIN_SET.has(domain));
  if (unknownDomain) return skipped(`unknown domain "${unknownDomain}"`);
  if (!record.media.image_url) return skipped('missing image url');

  const { baseName, suffixes } = splitName(record.name);
  const nameSlug = slugify(baseName);
  if (!nameSlug) return skipped('empty name');
  return {
    record,
    baseName,
    nameSlug,
    type: type as CardType,
    domains: record.classification.domain as Domain[],
    ...detectVariant(record, suffixes),
  };
}

export function imageBase(record: RiftcodexCard): string {
  return record.media.image_url.split('?')[0] ?? '';
}

/** Number and product line of a source id, without the set prefix: "pr-068-298" gives "068-298". */
function idTail(riftboundId: string): string {
  return riftboundId.slice(riftboundId.indexOf('-') + 1);
}

/**
 * Alternate art guessed from an `a` marker must really look different. Promo sets reprint
 * cards from main sets (pr-068a reuses ogn-068), so when the artwork equals a standard printing
 * with the same number and product line in any set, the record becomes a distinct "Promo"
 * printing instead. Keys stay unique and nothing is mislabelled as alternate art.
 */
export function resolveMarkerVariants(items: Prepared[]): Prepared[] {
  const standardImages = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.variant !== 'standard') continue;
    const tail = idTail(item.record.riftbound_id);
    standardImages.set(tail, (standardImages.get(tail) ?? new Set()).add(imageBase(item.record)));
  }
  return items.map((item) => {
    if (!item.inferredFromMarker) return item;
    const siblings = standardImages.get(idTail(withoutAltMarker(item.record.riftbound_id)));
    return siblings?.has(imageBase(item.record)) ? { ...item, ...PROMO_REPRINT, keySlug: item.keySlug, inferredFromMarker: false } : item;
  });
}

export function isSkipped(value: Prepared | Skipped): value is Skipped {
  return !('record' in value);
}

/** Rules fingerprint: two records with the same name but a different one are different cards. */
function ruleSignature(item: Prepared): string {
  const { attributes } = item.record;
  return [item.type, attributes.energy, attributes.might, attributes.power, item.domains.join('+')].join('|');
}

/**
 * cardKey per item (input order). It is the name slug, so "Vi - Destructive" and
 * "Vi, Destructive" merge. If one name slug is shared by records whose type, energy,
 * might, power or domains differ, the rules signature is appended to every card except the
 * oldest one (smallest source id), whose key therefore never changes when a namesake arrives.
 * The real dataset has no such case; the guard protects future sets.
 */
export function assignCardKeys(items: Prepared[]): string[] {
  const bySlug = new Map<string, Prepared[]>();
  for (const item of items) bySlug.set(item.nameSlug, [...(bySlug.get(item.nameSlug) ?? []), item]);
  const primary = new Map<string, string>();
  for (const [slug, members] of bySlug) {
    const oldest = [...members].sort((a, b) => a.record.id.localeCompare(b.record.id))[0] as Prepared;
    primary.set(slug, ruleSignature(oldest));
  }
  return items.map((item) => {
    const signatures = new Set((bySlug.get(item.nameSlug) ?? []).map(ruleSignature));
    const isPrimary = ruleSignature(item) === primary.get(item.nameSlug);
    return signatures.size > 1 && !isPrimary ? `${item.nameSlug}-${slugify(ruleSignature(item))}` : item.nameSlug;
  });
}
