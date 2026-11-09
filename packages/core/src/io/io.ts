/**
 * Public surface of import and export. Implementations live in sibling modules:
 * csv.ts (parser), headers.ts (header alias table), matcher.ts (printing lookup),
 * collectionCsv.ts, mergeEntries.ts, backup.ts, deckText.ts. Tunables are in config.ts.
 */
export { parseCollectionCsv, exportCollectionCsv } from './collectionCsv';
export type { CollectionImportResult, ImportRowIssue } from './collectionCsv';
export type { CsvFormat } from './headers';
export { mergeImportedEntries } from './mergeEntries';
export { ownedEntryKey } from './entries';
export { exportBackup, importBackup } from './backup';
export { formatDeckText, parseDeckText } from './deckText';
