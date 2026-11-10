import type { Condition, Finish } from '../types';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tunables for sync merge logic and record validation. */
export const SYNC_CONFIG = {
  /** Tombstones are kept this long after the server received them. */
  defaultTombstoneRetentionMs: 90 * MS_PER_DAY,
  /** Records stamped further ahead of server time than this are clamped to server time. */
  defaultMaxClockSkewMs: 5 * 60 * 1000,
  /** Upper bound on record id length accepted by validation. */
  maxRecordIdLength: 200,
  /** Largest believable updatedAt (epoch ms, start of year 2100). Anything above is rejected. */
  maxUpdatedAt: 4_102_444_800_000,
  /** Deepest nesting allowed inside one record, so hostile payloads cannot blow the stack. */
  maxRecordDepth: 12,
} as const;

/** Field limits for synced records, shared by backup import and the server. */
export const RECORD_LIMITS = {
  maxQuantity: 9999,
  maxDeckSlotCount: 99,
  maxGameCount: 99_999,
  maxStringLength: 5000,
  maxKeyLength: 200,
  maxTagCount: 200,
  maxSlotsPerList: 500,
  maxRecordsPerCollection: 200_000,
} as const;

export const FINISHES: readonly Finish[] = ['normal', 'foil'];
export const CONDITIONS: readonly Condition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];
