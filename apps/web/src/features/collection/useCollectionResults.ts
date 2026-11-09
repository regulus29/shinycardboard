import { useMemo } from 'react';
import { runSearch, type Catalog, type ParseWarning, type SearchHit } from '@sc/core';
import { useRequiredCatalog, useSearchContext } from '../../data';
import { applyScope, countOwned, flattenGroups, groupHits, type HitGroup, type OwnedCount } from './grouping';
import type { CollectionParams } from './params';
import { mergeWarnings } from './queryEdit';

export interface CollectionResults {
  catalog: Catalog;
  /** Printing key to owned copies, across the whole collection (not only the matches). */
  counts: Map<string, OwnedCount>;
  groups: HitGroup[];
  /** Hits in display order (groups concatenated); keyboard and prev/next navigation index into this. */
  flat: SearchHit[];
  warnings: ParseWarning[];
  /** Card key to user tags, for the table Tags column. */
  tagsByCard: Record<string, string[]>;
}

/**
 * Query, scope, sort and grouping applied to the catalog. Returns undefined until user data has
 * loaded. Shared by the collection page and card detail so "previous" and "next" follow the same order.
 */
export function useCollectionResults(params: CollectionParams): CollectionResults | undefined {
  const catalog = useRequiredCatalog();
  const ctx = useSearchContext();
  const { query, scope, sort, descending, group } = params;
  return useMemo(() => {
    if (!ctx) return undefined;
    const counts = countOwned(ctx.owned);
    const { hits, warnings } = runSearch(query, catalog, ctx, { sort, descending });
    const groups = groupHits(applyScope(hits, scope, counts), group, catalog);
    return { catalog, counts, groups, flat: flattenGroups(groups), warnings: mergeWarnings(warnings, query), tagsByCard: ctx.tagsByCard };
  }, [catalog, ctx, query, scope, sort, descending, group]);
}
