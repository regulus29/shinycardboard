import type { SearchHit } from '@sc/core';
import type { HitGroup } from './grouping';

/** One virtual list entry: a group header or a row holding `hits` (several tiles, or one table row). */
export type ListItem =
  | { kind: 'header'; key: string; label: string; count: number; height: number }
  | { kind: 'row'; key: string; start: number; hits: SearchHit[]; height: number };

export interface ListGeometry {
  columns: number;
  /** Height of a row including the gap below it. */
  rowStride: number;
  headerHeight: number;
}

/** How many tiles fit across `width`, never fewer than one. */
export function gridColumns(width: number, minTile: number, gap: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (minTile + gap)));
}

export function tileWidth(width: number, columns: number, gap: number): number {
  return (width - gap * (columns - 1)) / columns;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** Flatten groups into headers and rows. `start` is the index of the row's first hit in display order. */
export function buildItems(groups: HitGroup[], geometry: ListGeometry): ListItem[] {
  const items: ListItem[] = [];
  let cursor = 0;
  for (const group of groups) {
    if (group.label) {
      items.push({ kind: 'header', key: `h:${group.key}`, label: group.label, count: group.hits.length, height: geometry.headerHeight });
    }
    for (const rowHits of chunk(group.hits, geometry.columns)) {
      items.push({ kind: 'row', key: `r:${group.key}:${cursor}`, start: cursor, hits: rowHits, height: geometry.rowStride });
      cursor += rowHits.length;
    }
  }
  return items;
}

/** Prefix sums: offsets[i] is the top of item i and offsets[n] is the total height. */
export function buildOffsets(heights: readonly number[]): number[] {
  const offsets = [0];
  for (const height of heights) offsets.push((offsets[offsets.length - 1] ?? 0) + height);
  return offsets;
}

/** First index whose bottom edge is below `y` (binary search over the prefix sums). */
function indexAt(offsets: readonly number[], y: number): number {
  let low = 0;
  let high = offsets.length - 2;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((offsets[mid + 1] ?? 0) <= y) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low);
}

export interface VisibleRange {
  start: number;
  /** Exclusive. */
  end: number;
}

/**
 * Items to render for a viewport. `scrollTop` is relative to the list's own top, so it may be
 * negative while the list is still below the fold. `overscan` is extra pixels rendered each side.
 */
export function visibleRange(offsets: readonly number[], scrollTop: number, viewport: number, overscan: number): VisibleRange {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0 };
  const top = Math.max(0, scrollTop - overscan);
  const bottom = scrollTop + viewport + overscan;
  if (bottom <= 0) return { start: 0, end: Math.min(count, 1) };
  const start = indexAt(offsets, top);
  let end = start;
  while (end < count && (offsets[end] ?? 0) < bottom) end += 1;
  return { start, end: Math.max(end, Math.min(count, start + 1)) };
}

/** Index of the item containing hit number `index` in display order, or -1. */
export function itemIndexForHit(items: readonly ListItem[], index: number): number {
  return items.findIndex((item) => item.kind === 'row' && index >= item.start && index < item.start + item.hits.length);
}
