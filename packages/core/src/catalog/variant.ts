import type { RiftcodexCard, Variant } from '../types';
import { METAL_SUFFIX, VARIANT_LABELS } from './vocabulary';
import { slugify } from './slug';

const PARENTHETICAL = /\(([^)]*)\)/g;
const PURE_NUMBER = /^\d+$/;

export interface NameParts {
  /** Name with every parenthetical removed and whitespace collapsed. */
  baseName: string;
  /** Parenthetical contents that describe a printing, e.g. "Metal". Pure numbers are excluded. */
  suffixes: string[];
}

/**
 * Split "Red Brambleback (Alternate Art)" into base name and suffixes.
 * Token names such as "Recruit (271) // Buff" carry a collector number in parentheses,
 * which is dropped from the name but is not a variant.
 */
export function splitName(name: string): NameParts {
  const suffixes = [...name.matchAll(PARENTHETICAL)]
    .map((match) => (match[1] ?? '').trim())
    .filter((text) => text && !PURE_NUMBER.test(text));
  const baseName = name.replace(PARENTHETICAL, ' ').replace(/\s+/g, ' ').trim();
  return { baseName, suffixes };
}

export interface VariantInfo {
  variant: Variant;
  variantLabel: string | null;
  /** Slug used inside the printing key. */
  variantSlug: string;
  /** True when alternate art was guessed from the `a` marker alone; see resolveMarkerVariants. */
  inferredFromMarker?: boolean;
  /**
   * Variant slug used in the printing key when it differs from `variantSlug`. Marker-inferred
   * records always key as alternate art, so a later change in the neighbouring records (which
   * decides alternate art versus promo reprint) can never rename a printing.
   */
  keySlug?: string;
}

const STANDARD: VariantInfo = { variant: 'standard', variantLabel: null, variantSlug: 'standard' };

function flaggedVariant(metadata: RiftcodexCard['metadata']): Variant | null {
  if (metadata.alternate_art) return 'alternate-art';
  if (metadata.overnumbered) return 'overnumbered';
  if (metadata.signature) return 'signature';
  return null;
}

/** The set size is the last numeric segment of the source id, for example 166 in "ven-167-166". */
const SET_SIZE_SEGMENT = /-(\d+)$/;

/**
 * Overnumbered cards carry a collector number above the set size encoded in their source id.
 * The source sometimes omits the overnumbered flag (31 VEN cards), so it is inferred for
 * unflagged, unlabelled records. Labelled printings (for example "Ultimate") keep their label.
 */
export function exceedsSetSize(record: RiftcodexCard): boolean {
  const size = SET_SIZE_SEGMENT.exec(record.riftbound_id)?.[1];
  return size !== undefined && record.collector_number > Number.parseInt(size, 10);
}

/** Source ids mark alternate art with an `a` after the number, for example "ven-084a-166". */
const ALTERNATE_MARKER = /^[a-z]+-\d+a-/i;

function altMarked(record: RiftcodexCard): boolean {
  return ALTERNATE_MARKER.test(record.riftbound_id);
}

const ALTERNATE: VariantInfo = {
  variant: 'alternate-art',
  variantLabel: VARIANT_LABELS['alternate-art'] ?? 'Alternate Art',
  variantSlug: 'alternate-art',
  inferredFromMarker: true,
  keySlug: 'alternate-art',
};

/** A marked printing whose artwork equals the unmarked one: a promo reprint, not alternate art. */
export const PROMO_REPRINT: VariantInfo = { variant: 'other', variantLabel: 'Promo', variantSlug: 'promo' };

/** The source id without its `a` marker: "pr-068a-298" gives "pr-068-298". */
export function withoutAltMarker(riftboundId: string): string {
  return riftboundId.replace(/^([a-z]+-\d+)a-/i, '$1-');
}

const OVERNUMBERED: VariantInfo = {
  variant: 'overnumbered',
  variantLabel: VARIANT_LABELS.overnumbered ?? 'Overnumbered',
  variantSlug: 'overnumbered',
};

/** Variant from metadata flags first, then the name suffix, then source id rules (set size, `a` marker). */
export function detectVariant(record: RiftcodexCard, suffixes: string[]): VariantInfo {
  const flagged = flaggedVariant(record.metadata);
  if (flagged) {
    return { variant: flagged, variantLabel: VARIANT_LABELS[flagged] ?? null, variantSlug: flagged };
  }
  const metal = suffixes.find((suffix) => suffix.toLowerCase() === METAL_SUFFIX);
  if (metal) {
    return { variant: 'metal', variantLabel: VARIANT_LABELS.metal ?? metal, variantSlug: 'metal' };
  }
  const label = suffixes[0];
  if (label) {
    return { variant: 'other', variantLabel: label, variantSlug: slugify(label) || 'other' };
  }
  if (exceedsSetSize(record)) return OVERNUMBERED;
  return altMarked(record) ? ALTERNATE : STANDARD;
}
