import type { Condition, Finish } from '@sc/core';

/** RFC 4122 v4 id for records without a natural key (decks, saved searches). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
    c === 'x' ? hex() : ((Number.parseInt(hex(), 16) & 0x3) | 0x8).toString(16),
  );
}

/**
 * Owned rows use a deterministic id so two devices that add the same printing, finish and
 * condition converge on one record when they sync instead of creating duplicates.
 */
export function ownedId(printingKey: string, finish: Finish, condition: Condition): string {
  return `${printingKey}|${finish}|${condition}`;
}
