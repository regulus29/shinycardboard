import { SYNC_COLLECTIONS, type SyncCollection } from '../types';
import { CONDITIONS, FINISHES, RECORD_LIMITS } from './config';
import { isPlainObject, validateSyncRecord } from './validate';

type Obj = Record<string, unknown>;
type RecordCheck = (record: Obj, path: string) => string | null;

const isString = (v: unknown): v is string => typeof v === 'string';
const { maxStringLength, maxKeyLength } = RECORD_LIMITS;

function stringField(record: Obj, key: string, path: string, max: number, optional = false): string | null {
  const value = record[key];
  if (value === undefined && optional) return null;
  if (!isString(value)) return `${path}.${key} must be a string`;
  return value.length <= max ? null : `${path}.${key} is longer than ${max} characters`;
}

function stringList(record: Obj, key: string, path: string, optional: boolean): string | null {
  const value = record[key];
  if (value === undefined && optional) return null;
  if (!Array.isArray(value) || !value.every(isString)) return `${path}.${key} must be a list of strings`;
  if (value.length > RECORD_LIMITS.maxTagCount) return `${path}.${key} has more than ${RECORD_LIMITS.maxTagCount} items`;
  return value.some((v) => v.length > maxKeyLength) ? `${path}.${key} has an item longer than ${maxKeyLength} characters` : null;
}

function oneOf(record: Obj, key: string, allowed: readonly string[], path: string): string | null {
  const value = record[key];
  return isString(value) && allowed.includes(value) ? null : `${path}.${key} must be one of ${allowed.join(', ')}`;
}

function count(record: Obj, key: string, path: string, min: number, max: number): string | null {
  const value = record[key];
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? null
    : `${path}.${key} must be a whole number from ${min} to ${max}`;
}

const firstProblem = (...checks: (string | null)[]): string | null => checks.find((c) => c !== null) ?? null;

const checkOwned: RecordCheck = (r, p) =>
  firstProblem(
    stringField(r, 'printingKey', p, maxKeyLength),
    oneOf(r, 'finish', FINISHES, p),
    oneOf(r, 'condition', CONDITIONS, p),
    count(r, 'quantity', p, 0, RECORD_LIMITS.maxQuantity),
    stringField(r, 'notes', p, maxStringLength, true),
  );

const checkTagging: RecordCheck = (r, p) =>
  firstProblem(stringField(r, 'cardKey', p, maxKeyLength), stringList(r, 'tags', p, false), stringField(r, 'note', p, maxStringLength, true));

function checkSlot(slot: unknown, path: string): string | null {
  if (!isPlainObject(slot)) return `${path} must be an object`;
  return firstProblem(
    stringField(slot, 'cardKey', path, maxKeyLength),
    count(slot, 'count', path, 1, RECORD_LIMITS.maxDeckSlotCount),
    stringField(slot, 'printingKey', path, maxKeyLength, true),
  );
}

const SLOT_LISTS = ['main', 'runes', 'battlefields', 'sideboard'] as const;

function checkSlotList(deck: Obj, key: string, path: string): string | null {
  const slots = deck[key];
  if (!Array.isArray(slots)) return `${path}.${key} must be a list`;
  if (slots.length > RECORD_LIMITS.maxSlotsPerList) return `${path}.${key} has more than ${RECORD_LIMITS.maxSlotsPerList} slots`;
  for (let i = 0; i < slots.length; i++) {
    const problem = checkSlot(slots[i], `${path}.${key}[${i}]`);
    if (problem) return problem;
  }
  return null;
}

const checkDeck: RecordCheck = (r, p) =>
  firstProblem(
    stringField(r, 'name', p, maxKeyLength),
    stringField(r, 'legendKey', p, maxKeyLength, true),
    stringField(r, 'chosenChampionKey', p, maxKeyLength, true),
    stringField(r, 'notes', p, maxStringLength, true),
    stringList(r, 'tags', p, true),
    ...SLOT_LISTS.map((key) => checkSlotList(r, key, p)),
  );

const checkSavedSearch: RecordCheck = (r, p) =>
  firstProblem(stringField(r, 'name', p, maxKeyLength), stringField(r, 'query', p, maxStringLength));

const COLLECTION_CHECKS: Record<SyncCollection, RecordCheck> = {
  owned: checkOwned,
  taggings: checkTagging,
  decks: checkDeck,
  savedSearches: checkSavedSearch,
};

/** Validate one record of a named collection: base sync fields, then the collection's own shape. */
export function validateCollectionRecord(collection: SyncCollection, record: unknown, path: string): string | null {
  const base = validateSyncRecord(record, path);
  return base ?? COLLECTION_CHECKS[collection](record as Obj, path);
}

/** Every problem in a list of records, including duplicate ids. Used for whole-file validation. */
export function validateCollectionRecords(collection: SyncCollection, records: unknown[]): string[] {
  if (records.length > RECORD_LIMITS.maxRecordsPerCollection) {
    return [`${collection} has more than ${RECORD_LIMITS.maxRecordsPerCollection} records`];
  }
  const problems: string[] = [];
  const seen = new Set<string>();
  records.forEach((record, i) => {
    const path = `${collection}[${i}]`;
    const problem = validateCollectionRecord(collection, record, path);
    if (problem) problems.push(problem);
    else {
      const id = (record as Obj).id as string;
      if (seen.has(id)) problems.push(`${path}.id "${id}" is used twice`);
      seen.add(id);
    }
  });
  return problems;
}

export const isSyncCollection = (name: string): name is SyncCollection =>
  (SYNC_COLLECTIONS as readonly string[]).includes(name);
