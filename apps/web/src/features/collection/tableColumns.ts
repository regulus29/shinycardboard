import type { SortKey } from './constants';
import { TABLE_COLUMNS_STORAGE_KEY } from './constants';

export type ColumnKey = 'art' | 'name' | 'number' | 'domain' | 'type' | 'energy' | 'might' | 'rarity' | 'variant' | 'finish' | 'condition' | 'tags' | 'owned';
export type Tier = 'phone' | 'medium' | 'wide';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  sort?: SortKey;
  /** CSS grid track. */
  width: string;
  /** Smallest viewport tier that shows the column. */
  from: Tier;
  optional?: boolean;
  numeric?: boolean;
}

const TIER_RANK: Record<Tier, number> = { phone: 0, medium: 1, wide: 2 };

export const COLUMNS: readonly ColumnDef[] = [
  { key: 'art', label: '', width: '2.5rem', from: 'phone' },
  { key: 'name', label: 'Name', sort: 'name', width: 'minmax(9rem, 2.4fr)', from: 'phone' },
  { key: 'number', label: 'Number', sort: 'set', width: '6.5rem', from: 'medium' },
  { key: 'domain', label: 'Domain', width: '4.5rem', from: 'medium' },
  { key: 'type', label: 'Type', width: '5.5rem', from: 'medium' },
  { key: 'energy', label: 'Energy', sort: 'energy', width: '4.25rem', from: 'medium', numeric: true },
  { key: 'might', label: 'Might', sort: 'might', width: '4.25rem', from: 'medium', numeric: true },
  { key: 'rarity', label: 'Rarity', sort: 'rarity', width: '8rem', from: 'wide' },
  { key: 'variant', label: 'Variant', width: '7rem', from: 'wide' },
  { key: 'finish', label: 'Finish', width: '6.5rem', from: 'medium', optional: true },
  { key: 'condition', label: 'Condition', width: '6.5rem', from: 'medium', optional: true },
  { key: 'tags', label: 'Tags', width: 'minmax(7rem, 1.4fr)', from: 'medium', optional: true },
  { key: 'owned', label: 'Owned', sort: 'owned', width: '8.5rem', from: 'phone' },
];

export const OPTIONAL_COLUMNS: readonly ColumnDef[] = COLUMNS.filter((column) => column.optional);

/** Columns to render at a viewport tier, including the optional ones the user switched on. */
export function visibleColumns(tier: Tier, optional: readonly ColumnKey[]): ColumnDef[] {
  return COLUMNS.filter((column) => TIER_RANK[tier] >= TIER_RANK[column.from] && (!column.optional || optional.includes(column.key)));
}

export const gridTemplate = (columns: readonly ColumnDef[]): string => columns.map((column) => column.width).join(' ');

export function loadOptionalColumns(): ColumnKey[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TABLE_COLUMNS_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? OPTIONAL_COLUMNS.map((c) => c.key).filter((key) => parsed.includes(key)) : [];
  } catch {
    return [];
  }
}

export function saveOptionalColumns(keys: readonly ColumnKey[]): void {
  try {
    localStorage.setItem(TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // preference only
  }
}
