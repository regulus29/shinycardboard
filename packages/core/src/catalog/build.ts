import type { Catalog, RiftcodexCard } from '../types';

/**
 * Convert raw Riftcodex records into the normalized Catalog.
 * Must guarantee unique printingKeys (disambiguate collisions deterministically),
 * strip variant suffixes from names to derive cardKey, derive variant and variantLabel,
 * and parse keywords out of rules text.
 */
export function buildCatalog(_raw: RiftcodexCard[], _builtAt: string): Catalog {
  throw new Error('not implemented');
}
