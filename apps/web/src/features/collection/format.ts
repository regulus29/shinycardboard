import type { Printing } from '@sc/core';
import { VARIANT_LABELS } from './constants';

/** Short printed number such as "UNL-029a" (set code plus the number as printed, marker included). */
export function printingNumber(printing: Pick<Printing, 'setId' | 'riftboundId' | 'collectorNumber'>): string {
  const printed = printing.riftboundId.split('-')[1] ?? String(printing.collectorNumber).padStart(3, '0');
  return `${printing.setId}-${printed}`;
}

export function variantLabel(printing: Pick<Printing, 'variant' | 'variantLabel'>): string {
  return printing.variantLabel ?? VARIANT_LABELS[printing.variant] ?? printing.variant;
}

/** Unit stats line for headers and captions: "3 energy, 4 might". Empty when the card has none. */
export function statLine(card: { energy: number | null; might: number | null; power: number | null }): string {
  const parts: string[] = [];
  if (card.energy !== null) parts.push(`${card.energy} energy`);
  if (card.might !== null) parts.push(`${card.might} might`);
  if (card.power !== null) parts.push(`${card.power} power`);
  return parts.join(', ');
}

export const dash = (value: number | null): string => (value === null ? '-' : String(value));

export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}


/** Collector details worth showing on a tile: foil copies and any condition other than near mint. */
export function collectorInfo(count: { foil: number; conditions: readonly string[] } | undefined): string {
  if (!count) return '';
  const parts: string[] = [];
  if (count.foil > 0) parts.push('Foil');
  const worn = count.conditions.filter((condition) => condition !== 'NM');
  if (worn.length) parts.push(worn.join('/'));
  return parts.join(' - ');
}
