import type { Catalog, Condition, Finish, OwnedEntry, SearchHit } from '@sc/core';
import { OWNED_DEFAULTS } from '../../config/constants';
import { DOMAIN_ORDER, RARITY_ORDER, rarityKey } from '../../ui';
import { TYPE_ORDER, type GroupKey, type Scope } from './constants';

export interface OwnedCount {
  total: number;
  foil: number;
  /** Row a minus button should take a copy from: normal NM when present, else the first row. */
  target: { finish: Finish; condition: Condition };
  finishes: Finish[];
  conditions: Condition[];
}

/** Copies per printing across every finish and condition. */
export function countOwned(owned: readonly OwnedEntry[]): Map<string, OwnedCount> {
  const counts = new Map<string, OwnedCount>();
  for (const entry of owned) {
    if (entry.deleted || entry.quantity <= 0) continue;
    const current = counts.get(entry.printingKey) ?? { total: 0, foil: 0, target: { finish: entry.finish, condition: entry.condition }, finishes: [], conditions: [] };
    if (!current.finishes.includes(entry.finish)) current.finishes.push(entry.finish);
    if (!current.conditions.includes(entry.condition)) current.conditions.push(entry.condition);
    current.total += entry.quantity;
    if (entry.finish === 'foil') current.foil += entry.quantity;
    if (entry.finish === OWNED_DEFAULTS.finish && entry.condition === OWNED_DEFAULTS.condition) {
      current.target = { finish: entry.finish, condition: entry.condition };
    }
    counts.set(entry.printingKey, current);
  }
  return counts;
}

/** All cards keeps everything, Owned keeps printings with copies, Missing keeps printings with none. */
export function applyScope(hits: SearchHit[], scope: Scope, counts: Map<string, OwnedCount>): SearchHit[] {
  if (scope === 'all') return hits;
  const wantOwned = scope === 'owned';
  return hits.filter((hit) => counts.has(hit.printing.printingKey) === wantOwned);
}

export interface HitGroup {
  key: string;
  label: string;
  hits: SearchHit[];
}

interface Bucket {
  key: string;
  label: string;
  rank: number;
}

function bucketFor(hit: SearchHit, group: GroupKey, setRank: Map<string, number>, catalog: Catalog): Bucket {
  switch (group) {
    case 'set': {
      const setId = hit.printing.setId;
      const label = catalog.sets.find((set) => set.setId === setId)?.label ?? setId;
      return { key: setId, label, rank: setRank.get(setId) ?? setRank.size };
    }
    case 'domain': {
      const domain = hit.card.domains[0] ?? 'Colorless';
      return { key: domain, label: domain, rank: DOMAIN_ORDER.indexOf(domain) };
    }
    case 'type':
      return { key: hit.card.type, label: hit.card.type, rank: TYPE_ORDER.indexOf(hit.card.type) };
    case 'rarity': {
      const key = rarityKey(hit.printing.rarity);
      return { key, label: hit.printing.rarity, rank: RARITY_ORDER.indexOf(key) };
    }
    default:
      return { key: 'all', label: '', rank: 0 };
  }
}

/** Split ordered hits into labelled groups; hits keep their incoming order inside each group. */
export function groupHits(hits: SearchHit[], group: GroupKey, catalog: Catalog): HitGroup[] {
  if (group === 'none') return hits.length ? [{ key: 'all', label: '', hits }] : [];
  const setRank = new Map(catalog.sets.map((set, index) => [set.setId, index]));
  const buckets = new Map<string, { bucket: Bucket; hits: SearchHit[] }>();
  for (const hit of hits) {
    const bucket = bucketFor(hit, group, setRank, catalog);
    const entry = buckets.get(bucket.key) ?? { bucket, hits: [] };
    entry.hits.push(hit);
    buckets.set(bucket.key, entry);
  }
  return [...buckets.values()]
    .sort((a, b) => a.bucket.rank - b.bucket.rank)
    .map(({ bucket, hits: members }) => ({ key: bucket.key, label: bucket.label, hits: members }));
}

export const flattenGroups = (groups: HitGroup[]): SearchHit[] => groups.flatMap((group) => group.hits);
