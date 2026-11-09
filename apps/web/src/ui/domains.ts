import type { Domain } from '@sc/core';

/** Display order for domains everywhere in the UI. */
export const DOMAIN_ORDER: readonly Domain[] = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order', 'Colorless'];

/** CSS variable holding a domain's accent color (defined in tokens.css). */
export function domainColorVar(domain: Domain): string {
  return `var(--domain-${domain.toLowerCase()})`;
}

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'showcase', 'promo'] as const;
export type RarityKey = (typeof RARITY_ORDER)[number];

/** Map a source rarity string onto a known token key; unknown values fall back to common. */
export function rarityKey(rarity: string): RarityKey {
  const key = rarity.trim().toLowerCase();
  return (RARITY_ORDER as readonly string[]).includes(key) ? (key as RarityKey) : 'common';
}

export function rarityColorVar(rarity: string): string {
  return `var(--rarity-${rarityKey(rarity)})`;
}
